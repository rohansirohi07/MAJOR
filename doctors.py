"""Doctor directory: loads the CSV, understands typed answers, and searches."""
import difflib
import re
from urllib.parse import quote

import pandas as pd

CITY_ALIASES = {
    "bangalore": "Bengaluru", "bengaluru": "Bengaluru", "blr": "Bengaluru",
    "bombay": "Mumbai", "gurgaon": "Gurugram", "calcutta": "Kolkata",
    "madras": "Chennai", "hyd": "Hyderabad", "amdavad": "Ahmedabad",
    "ghaziabad": "Ghaziabad", "gzb": "Ghaziabad", "noida": "Noida", "pune": "Pune",
}
ANY_WORDS = r"\b(any|anything|no limit|no preference|doesn'?t matter|does not matter|no budget|skip|whatever|all)\b"
PG_PATTERN = r"\b(?:MS|DNB|DOMS|DO|MD)\b"


class DoctorDirectory:
    def __init__(self, path):
        df = pd.read_csv(path)
        df = df.rename(columns={
            "ID": "id", "City": "city", "State": "state", "Doctor Name": "name",
            "Qualifications": "qualifications", "Experience (Years)": "experience",
            "Consultation Fee (INR)": "fee", "Clinic / Location": "clinic",
        })
        for col in ("city", "state", "name", "qualifications", "clinic"):
            df[col] = df[col].astype(str).str.strip()
        df["online"] = df["clinic"].str.contains("online", case=False)
        df["pg"] = df["qualifications"].str.upper().str.contains(PG_PATTERN, regex=True)
        self.df = df
        self.city_names = sorted(df["city"].unique())

    # ---------- metadata ----------
    def meta(self):
        counts = self.df.groupby(["city", "state"]).size().reset_index(name="count")
        counts = counts.sort_values("count", ascending=False)
        return {
            "cities": counts.to_dict("records"),
            "total": int(len(self.df)),
            "experience": {"min": int(self.df.experience.min()), "max": int(self.df.experience.max())},
            "fee": {"min": int(self.df.fee.min()), "max": int(self.df.fee.max())},
        }

    # ---------- understanding typed answers ----------
    @staticmethod
    def parse_class(text):
        t = text.lower()
        if re.search(r"don'?t know|not sure|unsure|no idea|dont know", t):
            return {"ok": False, "unknown": True,
                    "message": "No problem. You can upload a retina photo in the Detect section and I will use that result."}
        t = re.sub(r"non[\s-]*proliferative|npdr", " ", t)
        rules = [(4, r"proliferative|pdr|\b4\b|advanced"), (3, r"severe|\b3\b"),
                 (2, r"moderate|medium|\b2\b"), (1, r"mild|early|\b1\b"),
                 (0, r"no dr|normal|healthy|none|no retinopathy|\b0\b")]
        for idx, pat in rules:
            if re.search(pat, t):
                return {"ok": True, "value": idx}
        return {"ok": False, "message": "I did not catch the stage. Pick one below or type it, for example 'mild' or 'severe'."}

    def parse_city(self, text):
        t = text.lower().strip()
        if re.search(ANY_WORDS, t) or "anywhere" in t:
            return {"ok": True, "value": None, "label": "Any city"}
        for alias, city in CITY_ALIASES.items():
            if re.search(rf"\b{re.escape(alias)}\b", t):
                return {"ok": True, "value": city, "label": city}
        lowered = {c.lower(): c for c in self.city_names}
        lowered.update({a: c for a, c in CITY_ALIASES.items()})
        for word in re.findall(r"[a-z]+", t):
            hit = difflib.get_close_matches(word, lowered.keys(), n=1, cutoff=0.7)
            if hit:
                return {"ok": True, "value": lowered[hit[0]], "label": lowered[hit[0]]}
        return {"ok": False, "message": "I only have doctors in " + ", ".join(self.city_names) + ". Choose one of these cities."}

    @staticmethod
    def _number(text):
        t = text.lower().replace(",", "")
        m = re.search(r"(\d+(?:\.\d+)?)\s*(k\b)?", t)
        if not m:
            return None
        v = float(m.group(1))
        return int(v * 1000) if m.group(2) else int(v)

    def parse_experience(self, text):
        if re.search(ANY_WORDS, text.lower()):
            return {"ok": True, "value": 0, "label": "Any experience"}
        n = self._number(text)
        if n is None or n > 50:
            return {"ok": False, "message": "Tell me the minimum years of experience as a number, like 5, or say 'any'."}
        return {"ok": True, "value": n, "label": f"{n}+ years" if n else "Any experience"}

    def parse_fee(self, text):
        if re.search(ANY_WORDS, text.lower()):
            return {"ok": True, "value": None, "label": "Any fee"}
        n = self._number(text)
        if n is None or n < 100:
            return {"ok": False, "message": "Tell me your maximum fee in rupees, like 700, or say 'any'."}
        return {"ok": True, "value": n, "label": f"Up to \u20b9{n:,}"}

    # ---------- search ----------
    def _filter(self, city, min_exp, max_fee):
        d = self.df
        if city:
            d = d[d.city == city]
        if min_exp:
            d = d[d.experience >= min_exp]
        if max_fee:
            d = d[d.fee <= max_fee]
        return d

    def search(self, city=None, min_experience=0, max_fee=None, class_index=0,
               sort="best", offset=0, limit=6):
        relaxed = []
        d = self._filter(city, min_experience, max_fee)
        if d.empty:  # relax one rule at a time so the user still gets useful options
            for label, args in (("fee", (city, min_experience, None)),
                                ("experience", (city, 0, max_fee)),
                                ("fee and experience", (city, 0, None))):
                d = self._filter(*args)
                if not d.empty:
                    relaxed = [label]
                    break
        if sort == "fee":
            d = d.sort_values(["fee", "experience"], ascending=[True, False])
        elif sort == "experience":
            d = d.sort_values(["experience", "fee"], ascending=[False, True])
        elif class_index >= 2:   # more serious stage: experience first
            d = d.sort_values(["experience", "fee"], ascending=[False, True])
        else:                    # routine check-up: affordable first
            d = d.sort_values(["fee", "experience"], ascending=[True, False])
        total = int(len(d))
        page = d.iloc[offset:offset + limit]
        doctors = []
        for r in page.itertuples():
            doctors.append({
                "id": int(r.id), "name": r.name, "qualifications": r.qualifications,
                "experience": int(r.experience), "fee": int(r.fee), "clinic": r.clinic,
                "city": r.city, "state": r.state, "online": bool(r.online), "pg": bool(r.pg),
                "map_url": None if r.online else
                "https://www.google.com/maps/search/?api=1&query=" + quote(f"{r.clinic} {r.city}"),
            })
        return {"total": total, "doctors": doctors, "relaxed": relaxed, "offset": offset,
                "has_more": offset + limit < total}
