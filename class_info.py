"""Medical explanations shown after a prediction.

Educational content only. It is a screening aid, never a diagnosis.
"""

CLASS_INFO = [
    {
        "key": "no_dr",
        "label": "No DR",
        "stage": "No diabetic retinopathy",
        "color": "#3ddc97",
        "urgency": "Routine",
        "urgency_level": 0,
        "summary": "No signs of diabetic damage were found in the retinal blood vessels.",
        "what_it_is": [
            "The small blood vessels of the retina look healthy, with no microaneurysms, bleeding or fluid.",
            "This does not mean the eye is risk-free. People with diabetes can develop retinopathy later, often without symptoms.",
        ],
        "causes": [
            "Diabetes is the underlying risk, even when the retina looks normal today.",
            "The risk grows with the number of years lived with diabetes.",
            "Long periods of high blood sugar, high blood pressure and high cholesterol raise the chance of future damage.",
        ],
        "precautions": [
            "Keep a yearly dilated eye exam, even if your vision feels fine.",
            "Keep blood sugar in the range your doctor sets for you. HbA1c is the usual long-term marker.",
            "Control blood pressure and cholesterol, and avoid smoking.",
            "Stay active, eat a balanced diet and keep a healthy weight.",
        ],
        "see_doctor": "Book a routine check once a year, or earlier if your vision changes.",
    },
    {
        "key": "mild",
        "label": "Mild",
        "stage": "Mild non-proliferative DR (NPDR)",
        "color": "#b8e04a",
        "urgency": "Monitor",
        "urgency_level": 1,
        "summary": "Early changes are present: tiny bulges called microaneurysms have formed in retinal vessels.",
        "what_it_is": [
            "Microaneurysms are small swellings in the walls of the retina's tiniest blood vessels. They may leak a little fluid.",
            "Vision is usually normal at this stage, which is why the condition goes unnoticed without screening.",
        ],
        "causes": [
            "Long-term high blood sugar damages the walls of small retinal vessels, so they weaken and bulge.",
            "High blood pressure and high cholesterol add to the damage.",
            "Smoking and a long duration of diabetes make it more likely.",
            "Pregnancy and kidney disease can speed it up in people with diabetes.",
        ],
        "precautions": [
            "Bring blood sugar closer to target. Good control can slow or stop progression at this stage.",
            "Check blood pressure and cholesterol regularly and treat them if raised.",
            "Stop smoking.",
            "Repeat a dilated eye exam every 6 to 12 months, as your eye doctor advises.",
            "Do not wait for symptoms. Damage at this stage is usually silent.",
        ],
        "see_doctor": "See an eye doctor within a few weeks to confirm the result and set a follow-up schedule.",
    },
    {
        "key": "moderate",
        "label": "Moderate",
        "stage": "Moderate non-proliferative DR (NPDR)",
        "color": "#ffc233",
        "urgency": "See an eye doctor",
        "urgency_level": 2,
        "summary": "More vessels are affected. Bleeding spots, fluid deposits and blocked vessels may be present.",
        "what_it_is": [
            "More microaneurysms, small hemorrhages and yellow fluid deposits (hard exudates) can appear, and some vessels start to close.",
            "Fluid can collect in the macula, the part of the retina used for reading and faces. This is called diabetic macular edema and can blur central vision.",
            "Without better control, some eyes move on to the severe stage.",
        ],
        "causes": [
            "Sustained high blood sugar keeps injuring vessel walls until they leak and some become blocked.",
            "Blocked vessels starve parts of the retina of oxygen.",
            "Uncontrolled blood pressure, high cholesterol and kidney disease make leakage worse.",
        ],
        "precautions": [
            "Get a full dilated eye exam with an ophthalmologist. Imaging such as OCT may be used to look for macular swelling.",
            "Follow up every 3 to 6 months, or as your eye doctor directs.",
            "Work with your diabetes doctor to tighten blood sugar, blood pressure and cholesterol control.",
            "Take prescribed medicines on time and do not stop them on your own.",
            "Quit smoking and limit alcohol.",
        ],
        "see_doctor": "Book an ophthalmology appointment soon. Go sooner if your central vision blurs or looks distorted.",
    },
    {
        "key": "severe",
        "label": "Severe",
        "stage": "Severe non-proliferative DR (NPDR)",
        "color": "#ff7a3d",
        "urgency": "Urgent referral",
        "urgency_level": 3,
        "summary": "Many retinal vessels are blocked. The retina is short of oxygen and the risk of the advanced stage is high.",
        "what_it_is": [
            "Large areas of the retina are not getting enough blood. The retina responds by sending distress signals to grow new vessels.",
            "Eye doctors often use the 4-2-1 rule to define this stage: bleeding in four quadrants, beaded veins in two, or abnormal vessel branching in one.",
            "A large share of eyes at this stage progress to proliferative disease within a year if untreated.",
        ],
        "causes": [
            "Years of poorly controlled diabetes lead to widespread vessel closure.",
            "Oxygen starvation of the retina releases growth signals such as VEGF that prepare the eye to grow fragile new vessels.",
            "High blood pressure, kidney disease and smoking speed up the process.",
        ],
        "precautions": [
            "Get referred to a retina specialist promptly. Treatment such as laser therapy or anti-VEGF injections may be considered.",
            "Attend every follow-up. Visits are often needed every 2 to 4 months.",
            "Control blood sugar, blood pressure and cholesterol closely with your care team.",
            "Report sudden floaters, dark spots, or loss of vision the same day.",
            "Do not rely on how your vision feels. Severe damage can still be painless.",
        ],
        "see_doctor": "Consult a retina specialist urgently, ideally within days to a couple of weeks.",
    },
    {
        "key": "proliferative",
        "label": "Proliferative DR",
        "stage": "Proliferative diabetic retinopathy (PDR)",
        "color": "#ff3d6e",
        "urgency": "Emergency risk",
        "urgency_level": 4,
        "summary": "Fragile new vessels are growing on the retina. This is the advanced stage and can threaten sight.",
        "what_it_is": [
            "Abnormal new blood vessels (neovascularization) grow on the retina or optic disc. They break easily and bleed into the eye.",
            "Bleeding into the vitreous gel causes floaters or sudden dark clouds in vision.",
            "Scar tissue can pull the retina loose (tractional retinal detachment), and new vessels can block fluid drainage and raise eye pressure (neovascular glaucoma).",
        ],
        "causes": [
            "Severe oxygen starvation of the retina triggers heavy release of VEGF, which drives growth of new, weak vessels.",
            "The cause behind this is long-standing, poorly controlled diabetes with high blood sugar.",
            "High blood pressure, kidney disease and smoking add to the risk.",
        ],
        "precautions": [
            "See a retina specialist immediately. Treatments include laser (pan-retinal photocoagulation), anti-VEGF injections, and surgery (vitrectomy) for bleeding or detachment.",
            "Do not delay. Early treatment greatly lowers the chance of severe vision loss.",
            "Go to an emergency eye service for a sudden shower of floaters, a curtain over vision, flashes of light or sudden vision loss.",
            "Keep blood sugar, blood pressure and cholesterol under strict control after treatment.",
            "Keep every follow-up visit, because treatment often needs repeating.",
        ],
        "see_doctor": "Seek an ophthalmologist or retina specialist as soon as possible, ideally the same week.",
    },
]

GENERAL = {
    "disclaimer": (
        "This tool is a research and screening aid built for a student project. "
        "It is not a medical device and cannot diagnose. Only a qualified eye doctor "
        "can confirm the stage after a full eye examination."
    ),
    "risk_factors": [
        "Long duration of diabetes",
        "Poor blood sugar control",
        "High blood pressure",
        "High cholesterol",
        "Smoking",
        "Pregnancy",
        "Kidney disease",
    ],
}
