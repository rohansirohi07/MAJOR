(() => {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CLASS_COLORS = ['#3ddc97', '#b8e04a', '#ffc233', '#ff7a3d', '#ff3d6e'];
  let METRICS = null;

  /* ---------- hero headline: words rise one by one ---------- */
  const h1 = $('h1.split');
  h1.innerHTML = h1.dataset.text.split(' ')
    .map((w, i) => `<span class="w"><i style="animation-delay:${0.15 + i * 0.09}s">${w}</i></span>`).join(' ');
  h1.setAttribute('aria-label', h1.dataset.text);

  /* ---------- nav + scroll progress ---------- */
  const nav = $('#nav'), bar = $('#progress');
  addEventListener('scroll', () => {
    nav.classList.toggle('solid', scrollY > 40);
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.width = (scrollY / max * 100) + '%';
    updateTimeline();
  }, { passive: true });

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: 0.15 });
  $$('.reveal').forEach(el => io.observe(el));

  /* ---------- counters ---------- */
  function countUp(el) {
    const to = parseFloat(el.dataset.count), dec = +(el.dataset.dec || 0), suf = el.dataset.suffix || '';
    if (reduce) { el.textContent = to.toFixed(dec) + suf; return; }
    const t0 = performance.now(), dur = 1800;
    (function tick(t) {
      const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 4);
      el.textContent = (to * e).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + suf;
      if (k < 1) requestAnimationFrame(tick);
    })(t0);
  }
  setTimeout(() => $$('[data-count]').forEach(countUp), 1500);

  /* ---------- model pipeline ---------- */
  const PIPE = [
    { n: 'Input image', s: '224 x 224 x 3', d: 'The retina photo is decoded to RGB and resized to 224 x 224. Pixels are divided by 255, then the ImageNet mean and standard deviation are subtracted and divided, exactly as during training.', t: 'Normalised with ImageNet mean and std' },
    { n: 'Patchify stem', s: '4 x 4 conv, stride 4', d: 'One convolution with a 4 x 4 window moving 4 pixels at a time cuts the photo into patches and turns it into a 56 x 56 grid of 128-channel features, followed by LayerNorm.', t: 'Output: 56 x 56 x 128' },
    { n: 'Stages 1 and 2', s: '3 + 3 blocks', d: 'Each ConvNeXt block applies a 7 x 7 depthwise convolution, LayerNorm, a 1 x 1 layer that expands channels 4x, GELU, a 1 x 1 layer that shrinks them, a learned layer scale and a residual connection. A 2 x 2 downsampling layer then halves the grid between stages.', t: '56 x 56 x 128, then 28 x 28 x 256' },
    { n: 'Stage 3', s: '27 blocks', d: 'The deepest stage, with 27 blocks working on a 14 x 14 grid of 512-channel features. Most of the network lives here. It combines small lesions with the wider vessel layout.', t: 'Output: 14 x 14 x 512' },
    { n: 'Stage 4', s: '3 blocks', d: 'The last three blocks work on a 7 x 7 grid of 1,024-channel features, the most abstract view of the retina.', t: 'Output: 7 x 7 x 1024' },
    { n: 'Pool + LayerNorm', s: '1024 values', d: 'Global average pooling squeezes the 7 x 7 grid into one vector of 1,024 values, and LayerNorm steadies their scale.', t: 'No stage-specific weights' },
    { n: 'Linear 5', s: 'logits to softmax', d: 'A final linear layer (1,024 inputs, 5 outputs) gives one raw score per stage. Softmax turns the scores into probabilities. This is the only layer replaced from the original ImageNet model.', t: 'No DR, Mild, Moderate, Severe, Proliferative DR' }
  ];
  const pipe = $('#pipeline'), detail = $('#pipeDetail');
  PIPE.forEach((p, i) => {
    if (i) { const l = document.createElement('div'); l.className = 'link'; l.style.setProperty('--d', (i * 0.25) + 's'); pipe.append(l); }
    const b = document.createElement('button');
    b.className = 'node' + (p.frozen ? ' frozen' : '');
    b.type = 'button'; b.setAttribute('role', 'tab');
    b.innerHTML = `<b>${p.n}</b><small>${p.s}</small>`;
    b.onclick = () => selectNode(i);
    pipe.append(b);
  });
  function selectNode(i) {
    $$('.node', pipe).forEach((n, k) => n.classList.toggle('on', k === i));
    const p = PIPE[i];
    detail.innerHTML = `<h3 class="swap">${p.n}</h3><p class="swap">${p.d}</p><span class="tag swap">${p.t}</span>`;
  }
  selectNode(1);

  /* ---------- training timeline ---------- */
  const STEPS = [
    ['Load the dataset', 'The Kaggle set <code>EyePACS + APTOS + Messidor</code>, folder <code>augmented_resized_V2/train</code>: 115,241 labelled retina photos in sub-folders 0 to 4.'],
    ['Check class counts', 'No DR 55,162, Mild 18,470, Moderate 24,198, Severe 7,936, Proliferative 9,475. No DR is almost half of all photos.'],
    ['Make 5 stratified folds', 'Photos are split into 5 folds with the same stage mix in each (<code>seed 42</code>). Fold 0 is held out for validation: 92,192 photos to train on, 23,049 to validate.'],
    ['Set up augmentation', 'Training photos get random crops, flips, 90-degree turns, small shifts and rotations, blur, colour jitter and cut-out patches. Validation photos are only resized to 224 x 224 and normalised.'],
    ['Build the network', 'Pretrained <code>convnext_base</code> from timm with a new 5-class output layer: 87,571,589 trainable weights, all of them updated.'],
    ['Choose loss and optimiser', 'Cross-entropy with label smoothing 0.1, AdamW (learning rate 0.0001, weight decay 0.01), cosine decay to 0.000001 over 12 epochs, mixed-precision training, batch size 32.'],
    ['Train for 12 epochs', 'After every epoch the model is scored on the validation fold, and the weights are saved whenever the quadratic weighted kappa improves. It improved every epoch, ending at 0.9412.'],
    ['Evaluate', 'On the 23,049 validation photos: accuracy 92.25%, plus the confusion matrix, per-class accuracy, classification report and ROC curves.'],
    ['Save the model', 'The best weights are saved as <code>best_convnext_fold0.pth</code>. Only fold 0 was trained, so the notebook\'s 5-fold ensemble was not used.']
  ];
  const tl = $('#timeline');
  tl.insertAdjacentHTML('afterbegin', '<span class="fill" id="tlFill"></span>');
  STEPS.forEach(([h, p], i) => tl.insertAdjacentHTML('beforeend',
    `<li data-n="${i + 1}"><h3>${h}</h3><p>${p}</p></li>`));
  function updateTimeline() {
    const items = $$('li', tl); let last = -1;
    items.forEach((li, i) => {
      const r = li.getBoundingClientRect();
      const on = r.top < innerHeight * 0.72;
      li.classList.toggle('in', on); if (on) last = i;
    });
    if (last >= 0) {
      const r = items[last].getBoundingClientRect(), t = tl.getBoundingClientRect();
      $('#tlFill').style.height = Math.max(0, r.top - t.top + 18) + 'px';
    } else $('#tlFill').style.height = '0';
  }
  updateTimeline();

  /* ---------- code tabs ---------- */
  const CODE = {
    'Data and folds': `from sklearn.model_selection import StratifiedKFold

# one row per photo: image_path, label (0-4)
skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
df["fold"] = -1
for fold, (_, val_idx) in enumerate(skf.split(df, df["label"])):
    df.loc[val_idx, "fold"] = fold

train_df = df[df["fold"] != 0]   # 92,192 photos
val_df   = df[df["fold"] == 0]   # 23,049 photos`,
    'Augmentation': `import albumentations as A
from albumentations.pytorch import ToTensorV2

MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]

train_tf = A.Compose([
    A.RandomResizedCrop(size=(224, 224), scale=(0.8, 1.0)),
    A.HorizontalFlip(p=0.5), A.VerticalFlip(p=0.5),
    A.RandomRotate90(p=0.5),
    A.ShiftScaleRotate(0.1, 0.1, 15, p=0.5),
    A.OneOf([A.GaussianBlur(), A.MotionBlur()], p=0.2),
    A.ColorJitter(0.2, 0.2, 0.2, 0.1, p=0.5),
    A.CoarseDropout(num_holes_range=(1, 8),
        hole_height_range=(16, 32), hole_width_range=(16, 32), p=0.3),
    A.Normalize(MEAN, STD), ToTensorV2()])

val_tf = A.Compose([A.Resize(224, 224),
    A.Normalize(MEAN, STD), ToTensorV2()])`,
    'Model': `import timm, torch.nn as nn, torch.optim as optim

model = timm.create_model("convnext_base",
    pretrained=True, num_classes=5).to("cuda")

criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
optimizer = optim.AdamW(model.parameters(),
    lr=1e-4, weight_decay=1e-2)
scheduler = optim.lr_scheduler.CosineAnnealingLR(
    optimizer, T_max=12, eta_min=1e-6)
scaler = GradScaler()                  # mixed precision`,
    'Train': `best_kappa = -1.0
for epoch in range(1, 13):
    train_loss, train_kappa, train_acc = train_one_epoch(
        model, train_loader, optimizer, criterion, scaler, device)
    val_loss, val_kappa, val_acc = validate(
        model, val_loader, criterion, device)
    scheduler.step()

    if val_kappa > best_kappa:         # keep the best epoch
        best_kappa = val_kappa
        torch.save(model.state_dict(),
                   "best_convnext_fold0.pth")`,
    'Predict': `import cv2, numpy as np, timm, torch

model = timm.create_model("convnext_base",
    pretrained=False, num_classes=5)
model.load_state_dict(torch.load("best_convnext_fold0.pth",
    map_location="cpu", weights_only=True))
model.eval()

img = cv2.cvtColor(cv2.imread(path), cv2.COLOR_BGR2RGB)
img = cv2.resize(img, (224, 224))                 # bilinear
x = (img / 255.0 - [0.485, 0.456, 0.406]) / [0.229, 0.224, 0.225]
x = torch.tensor(x.transpose(2, 0, 1)[None], dtype=torch.float32)

with torch.inference_mode():
    probs = torch.softmax(model(x), dim=1)[0]`
  };
  const tabs = $('#codeTabs'), view = $('#codeView');
  Object.keys(CODE).forEach((k, i) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = k; b.setAttribute('role', 'tab');
    b.onclick = () => showCode(k); tabs.append(b); if (!i) showCode(k);
  });
  function showCode(k) {
    $$('button', tabs).forEach(b => b.classList.toggle('on', b.textContent === k));
    view.textContent = CODE[k]; view.classList.remove('swap'); void view.offsetWidth; view.classList.add('swap');
  }
  $('#copyBtn').onclick = async e => {
    try { await navigator.clipboard.writeText(view.textContent); e.target.textContent = 'Copied'; }
    catch { e.target.textContent = 'Press Ctrl+C'; }
    setTimeout(() => e.target.textContent = 'Copy code', 1600);
  };

  /* ---------- hyperparameters ---------- */
  $('#hyper').innerHTML = [
    ['224 px', 'image size'], ['32', 'batch size'], ['12', 'epochs'],
    ['1e-4 to 1e-6', 'AdamW, cosine decay'], ['0.1', 'label smoothing'], ['87.6 M', 'trainable weights']
  ].map(([b, s]) => `<div><b>${b}</b><span>${s}</span></div>`).join('');

  /* ---------- learning curves (canvas) ---------- */
  const cv = $('#curve'), cx2 = cv.getContext('2d');
  let curveKey = 'acc', curveProg = 0, hoverEp = -1, curveRaf;
  function series() {
    const h = METRICS.history;
    if (curveKey === 'acc') return [h.accuracy, h.val_accuracy];
    if (curveKey === 'kappa') return [h.kappa, h.val_kappa];
    return [h.loss, h.val_loss];
  }
  function drawCurve() {
    if (!METRICS) return;
    const w = cv.width, h = cv.height, pad = { l: 56, r: 18, t: 16, b: 38 };
    cx2.clearRect(0, 0, w, h);
    const [a, b] = series(), all = a.concat(b);
    let lo = Math.min(...all), hi = Math.max(...all);
    const m = (hi - lo) * 0.12; lo -= m; hi += m;
    const X = i => pad.l + i * (w - pad.l - pad.r) / (a.length - 1);
    const Y = v => pad.t + (1 - (v - lo) / (hi - lo)) * (h - pad.t - pad.b);
    cx2.font = '13px Figtree, sans-serif'; cx2.fillStyle = '#9aa5cf'; cx2.strokeStyle = '#26305f'; cx2.lineWidth = 1;
    for (let k = 0; k <= 4; k++) {
      const v = lo + (hi - lo) * k / 4, y = Y(v);
      cx2.beginPath(); cx2.moveTo(pad.l, y); cx2.lineTo(w - pad.r, y); cx2.stroke();
      cx2.textAlign = 'right'; cx2.fillText(v.toFixed(2), pad.l - 8, y + 4);
    }
    const p1 = METRICS.phase1_epochs;
    if (p1) {
      cx2.save(); cx2.strokeStyle = '#9aa5cf'; cx2.setLineDash([5, 5]); cx2.beginPath();
      cx2.moveTo(X(p1 - 0.5), pad.t); cx2.lineTo(X(p1 - 0.5), h - pad.b); cx2.stroke(); cx2.setLineDash([]);
      cx2.fillStyle = '#9aa5cf'; cx2.textAlign = 'left'; cx2.fillText('Fine-tuning starts', X(p1 - 0.5) + 8, pad.t + 14); cx2.restore();
    }
    cx2.textAlign = 'center';
    a.forEach((_, i) => { if (i % 2 === 0) cx2.fillText(i + 1, X(i), h - 14); });
    cx2.fillText('Epoch', w / 2 + 20, h - 1);
    [[a, '#ffa24a'], [b, '#35e0c2']].forEach(([s, col]) => {
      const n = (s.length - 1) * curveProg;
      cx2.strokeStyle = col; cx2.lineWidth = 3; cx2.lineJoin = 'round'; cx2.beginPath();
      for (let i = 0; i <= Math.floor(n); i++) i ? cx2.lineTo(X(i), Y(s[i])) : cx2.moveTo(X(i), Y(s[i]));
      const f = n - Math.floor(n), i0 = Math.floor(n);
      if (f > 0 && i0 < s.length - 1) cx2.lineTo(X(i0) + (X(i0 + 1) - X(i0)) * f, Y(s[i0]) + (Y(s[i0 + 1]) - Y(s[i0])) * f);
      cx2.stroke();
      cx2.fillStyle = col;
      for (let i = 0; i <= Math.floor(n); i++) { cx2.beginPath(); cx2.arc(X(i), Y(s[i]), i === hoverEp ? 6 : 3.2, 0, 7); cx2.fill(); }
    });
    if (hoverEp >= 0) {
      cx2.strokeStyle = 'rgba(238,241,248,.35)'; cx2.setLineDash([4, 4]);
      cx2.beginPath(); cx2.moveTo(X(hoverEp), pad.t); cx2.lineTo(X(hoverEp), h - pad.b); cx2.stroke(); cx2.setLineDash([]);
    }
  }
  function playCurve() {
    cancelAnimationFrame(curveRaf);
    if (reduce) { curveProg = 1; drawCurve(); return; }
    curveProg = 0; const t0 = performance.now();
    (function step(t) {
      const k = Math.min(1, (t - t0) / 1800); curveProg = 1 - Math.pow(1 - k, 3); drawCurve();
      if (k < 1) curveRaf = requestAnimationFrame(step);
    })(t0);
  }
  $$('#curveSeg button').forEach(b => b.onclick = () => {
    $$('#curveSeg button').forEach(x => x.classList.toggle('on', x === b));
    curveKey = b.dataset.k; playCurve();
  });
  cv.addEventListener('pointermove', e => {
    if (!METRICS) return;
    const r = cv.getBoundingClientRect(), n = METRICS.history.accuracy.length;
    const px = (e.clientX - r.left) / r.width * cv.width;
    const i = Math.round((px - 56) / ((cv.width - 74) / (n - 1)));
    hoverEp = Math.max(0, Math.min(n - 1, i));
    const [a, b] = series();
    $('#curveNote').textContent = `Epoch ${hoverEp + 1}: train ${a[hoverEp].toFixed(3)}, val ${b[hoverEp].toFixed(3)}`;
    drawCurve();
  });
  cv.addEventListener('pointerleave', () => { hoverEp = -1; $('#curveNote').textContent = 'Hover to read an epoch'; drawCurve(); });
  new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { playCurve(); o.disconnect(); } }, { threshold: 0.4 }).observe(cv);

  /* ---------- visualizations gallery + explainer ---------- */
  const IMG = '/static/img/';
  const VIS = [
    { f: 'class_distribution', t: 'Class distribution', wide: 1,
      shows: 'A bar chart of how many of the 115,241 labelled photos belong to each severity stage, drawn from the counts printed in the notebook.',
      read: 'Taller bars mean more photos. Equal bars would mean balanced stages.',
      means: 'The data is imbalanced: No DR has 55,162 photos (48%) while Severe has 7,936 (7%). The folder is named augmented_resized_V2, so it contains augmented copies. A random 5-fold split of such a set can place copies of the same retina in both training and validation, which would make the scores look better than they really are.' },
    { f: 'loss_curve', t: 'Training vs validation loss', wide: 1,
      shows: 'The error the model is trying to minimise (cross-entropy with label smoothing), after each of the 12 epochs.',
      read: 'Lower is better. If validation loss stops falling or rises while training loss keeps dropping, the model has stopped generalising.',
      means: 'Training loss falls from 0.955 to 0.505 and validation loss from 0.836 to 0.559. Validation sits below training at first because training photos are heavily augmented. The lines cross at epoch 8. Validation loss is still edging down at epoch 12, so a longer run could help.' },
    { f: 'accuracy_curve', t: 'Accuracy per epoch',
      shows: 'How often the model was right after each epoch, on training photos and on the validation fold. Built from the epoch log in the notebook.',
      read: 'Both lines should climb and stay close. A large gap with training far above validation signals overfitting.',
      means: 'Validation accuracy rises from 78.3% to 92.3%. Training accuracy goes from 71.3% to 94.5% and passes validation at epoch 9. The final gap is only about 2 points, so there is little sign of overfitting on this split.' },
    { f: 'kappa_curve', t: 'Quadratic weighted kappa',
      shows: 'Agreement between the model and the true labels, where mistakes between far-apart stages cost more than mistakes between neighbouring stages.',
      read: '1.0 is perfect agreement and 0 is chance. Above 0.9 is usually described as very strong agreement.',
      means: 'Validation kappa climbs from 0.850 to 0.941, and the best checkpoint was saved at epoch 12. A high kappa means most mistakes are between neighbouring stages rather than between very different ones.' },
    { f: 'confusion_matrix', t: 'Confusion matrix (counts)',
      shows: 'A grid comparing the true stage (rows) with the predicted stage (columns) for all 23,049 validation photos.',
      read: 'The diagonal holds correct predictions. Any number off the diagonal is a mistake, and its position shows which stage was confused with which.',
      means: 'Most photos land on the diagonal. The mistakes cluster among No DR, Mild and Moderate. The riskiest are 497 Moderate photos predicted as No DR and 430 Mild photos predicted as No DR, because that is missed disease.' },
    { f: 'confusion_matrix_normalized', t: 'Normalized confusion matrix', wide: 1,
      shows: 'The same grid with each row divided by its total, so every row sums to 1. Built from the counts in the notebook.',
      read: 'The diagonal now equals recall for that stage. It shows what share of each true stage the model found.',
      means: 'Recall is 0.97 for No DR, 0.84 for Mild, 0.85 for Moderate, 0.98 for Severe and 0.97 for Proliferative. About 10% of Moderate photos and 12% of Mild photos are called No DR.' },
    { f: 'per_class_accuracy', t: 'Per-class accuracy', wide: 1,
      shows: 'The share of photos of each true stage that the model labelled correctly.',
      read: 'Each bar is the diagonal of the confusion matrix divided by the row total. It is the same number as recall.',
      means: 'Severe (0.98), No DR (0.97) and Proliferative (0.97) are the strongest. Mild (0.84) and Moderate (0.85) are the weakest, and they are also the stages that look most alike.' },
    { f: 'prf_by_class', t: 'Precision, recall and F1 by class', wide: 1,
      shows: 'Three scores for each stage side by side, computed from the notebook\'s confusion matrix.',
      read: 'Precision: of the photos predicted as this stage, how many were correct. Recall: of the true photos of this stage, how many were found. F1 balances the two.',
      means: 'No DR has precision 0.92 and recall 0.97. Mild and Moderate both have F1 near 0.87, Severe 0.98 and Proliferative 0.97. Overall accuracy is 92.25% and macro F1 is 0.93.' },
    { f: 'roc_auc', t: 'ROC-AUC curves', wide: 1,
      shows: 'For each stage treated as one-versus-rest, how well the predicted probability separates that stage from all others across every threshold.',
      read: 'A curve hugging the top-left corner is good. The dashed diagonal is random guessing (AUC 0.5). AUC of 1.0 is perfect.',
      means: 'AUC is 0.979 for No DR, 0.977 for Mild, 0.974 for Moderate, 1.000 for Severe and 0.999 for Proliferative. The probabilities separate every stage very well, with the early stages slightly harder.' }
  ];
  const gal = $('#gallery');
  VIS.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'shot reveal' + (v.wide ? ' wide' : ''); b.type = 'button';
    b.style.transitionDelay = (i % 3) * 90 + 'ms';
    b.innerHTML = `<img src="${IMG + v.f}.png" alt="${v.t}" loading="lazy"><span class="cap">${v.t}</span>`;
    b.onclick = () => openModal(i); gal.append(b); io.observe(b);
  });

  const modal = $('#modal'); let cur = 0, lastFocus;
  const dots = $('#mDots'); VIS.forEach(() => dots.append(document.createElement('i')));
  function fill() {
    const v = VIS[cur];
    $('#mImg').src = IMG + v.f + '.png'; $('#mImg').alt = v.t;
    $('#mCount').textContent = `Plot ${cur + 1} of ${VIS.length}`;
    $('#mTitle').textContent = v.t; $('#mShows').textContent = v.shows;
    $('#mRead').textContent = v.read; $('#mMeans').textContent = v.means;
    $$('i', dots).forEach((d, k) => d.classList.toggle('on', k === cur));
    $('#mPrev').disabled = cur === 0; $('#mNext').textContent = cur === VIS.length - 1 ? 'Done' : 'Next';
    [$('.m-img'), $('.m-text')].forEach(el => { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); });
  }
  function openModal(i) { cur = i; lastFocus = document.activeElement; modal.hidden = false; document.body.style.overflow = 'hidden'; fill(); $('.x').focus(); }
  function closeModal() { modal.hidden = true; document.body.style.overflow = ''; lastFocus && lastFocus.focus(); }
  $('#explainAll').onclick = () => openModal(0);
  $('#mPrev').onclick = () => { if (cur > 0) { cur--; fill(); } };
  $('#mNext').onclick = () => { if (cur < VIS.length - 1) { cur++; fill(); } else closeModal(); };
  $$('[data-close]', modal).forEach(el => el.onclick = closeModal);
  addEventListener('keydown', e => {
    if (modal.hidden) return;
    if (e.key === 'Escape') closeModal();
    if (e.key === 'ArrowRight') $('#mNext').click();
    if (e.key === 'ArrowLeft') $('#mPrev').click();
  });

  /* ---------- interactive confusion matrix ---------- */
  function buildCM() {
    const names = METRICS.class_names, m = METRICS.confusion_matrix, cm = $('#cm');
    const rowSum = m.map(r => r.reduce((a, b) => a + b, 0));
    cm.innerHTML = '<div></div>' + names.map(n => `<div class="h">${n}</div>`).join('');
    m.forEach((row, i) => {
      cm.insertAdjacentHTML('beforeend', `<div class="h">${names[i]}</div>`);
      row.forEach((v, j) => {
        const frac = v / rowSum[i];
        const c = document.createElement('div');
        c.className = 'cell' + (i === j ? ' diag' : '');
        c.style.setProperty('--a', (0.08 + frac * 0.92).toFixed(2));
        c.style.setProperty('--d', (i * 5 + j) * 35 + 'ms');
        c.textContent = v;
        c.onmouseenter = c.onfocus = () => {
          $('#cmReadout').innerHTML = i === j
            ? `<b>${v}</b> of ${rowSum[i]} <b>${names[i]}</b> photos were correctly found (${(frac * 100).toFixed(0)}%).`
            : `<b>${v}</b> true <b>${names[i]}</b> photos were predicted as <b>${names[j]}</b> (${(frac * 100).toFixed(0)}% of that stage).`;
        };
        c.tabIndex = 0; cm.append(c);
      });
    });
    new IntersectionObserver((es, o) => { if (es[0].isIntersecting) { cm.classList.add('in'); o.disconnect(); } }, { threshold: 0.3 }).observe(cm);
  }

  fetch('/api/metrics').then(r => r.json()).then(j => { METRICS = j; buildCM(); drawCurve(); })
    .catch(() => { $('#curveNote').textContent = 'Start the Flask server to load metrics'; });

  /* ---------- detect ---------- */
  const drop = $('#drop'), file = $('#file'), analyze = $('#analyze'), reset = $('#reset'),
    status = $('#status'), result = $('#result');
  let chosen = null;

  drop.onclick = () => { if (!chosen) file.click(); };
  drop.onkeydown = e => { if ((e.key === 'Enter' || e.key === ' ') && !chosen) { e.preventDefault(); file.click(); } };
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => setFile(e.dataTransfer.files[0]));
  file.onchange = () => setFile(file.files[0]);

  function msg(t, err) { status.textContent = t; status.classList.toggle('err', !!err); }
  function setFile(f) {
    if (!f) return;
    if (!/^image\/(png|jpe?g|bmp)$/.test(f.type)) return msg('Unsupported file type. Choose a PNG, JPG or BMP image.', true);
    if (f.size > 10 * 1024 * 1024) return msg('That image is larger than 10 MB. Choose a smaller file.', true);
    chosen = f; $('#previewImg').src = URL.createObjectURL(f);
    $('#dropEmpty').hidden = true; $('#preview').hidden = false;
    analyze.disabled = false; reset.hidden = false; result.hidden = true; msg(f.name);
  }
  reset.onclick = () => {
    chosen = null; file.value = ''; $('#preview').hidden = true; $('#dropEmpty').hidden = false;
    analyze.disabled = true; reset.hidden = true; result.hidden = true; drop.classList.remove('scanning'); msg('');
  };

  analyze.onclick = async () => {
    if (!chosen) return;
    analyze.disabled = true; drop.classList.add('scanning'); msg('Scanning the retina...');
    const fd = new FormData(); fd.append('image', chosen);
    try {
      const [res] = await Promise.all([fetch('/api/predict', { method: 'POST', body: fd }), new Promise(r => setTimeout(r, 1800))]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Prediction failed.');
      showResult(data); msg('Done. Scroll down for the full explanation.');
    } catch (err) {
      msg(err.message.includes('fetch') ? 'Could not reach the server. Make sure app.py is running.' : err.message, true);
    } finally { drop.classList.remove('scanning'); analyze.disabled = false; }
  };

  const li = (arr) => arr.map((t, i) => `<li class="item-in" style="--d:${0.12 * i}s">${t}</li>`).join('');
  function showResult(d) {
    const info = d.info, c = info.color, pct = (d.confidence * 100).toFixed(1);
    result.hidden = false; result.style.setProperty('--c', c);
    $('#verdict').style.setProperty('--c', c);
    $('#verdict').innerHTML = `
      <div class="gauge"><svg viewBox="0 0 190 190"><circle class="bg" cx="95" cy="95" r="82"/><circle class="fg" cx="95" cy="95" r="82"/></svg>
        <div class="num"><span id="pctNum">0%</span><small>confidence</small></div></div>
      <div class="v-text">
        <span class="pill">${info.urgency}</span>
        <h3>${info.stage}</h3>
        <p>${info.summary}</p>
        ${d.low_confidence ? `<div class="warn">The model is unsure. It also considered <b>${d.runner_up.label}</b> (${(d.runner_up.value * 100).toFixed(0)}%). Treat this result with extra caution and check the photo is a clear colour retina image.</div>` : ''}
        <div class="urg" aria-label="Urgency level ${info.urgency_level} of 4">${[0, 1, 2, 3, 4].map(k => `<i class="${k <= info.urgency_level ? 'on' : ''}" style="--c:${c}"></i>`).join('')}</div>
      </div>`;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      $('#verdict .fg').style.strokeDashoffset = 515 * (1 - d.confidence);
    }));
    const num = $('#pctNum'), t0 = performance.now();
    (function tick(t) { const k = Math.min(1, (t - t0) / 1500); num.textContent = (pct * (1 - Math.pow(1 - k, 3))).toFixed(1) + '%'; if (k < 1) requestAnimationFrame(tick); })(t0);

    $('#probs').innerHTML = d.probabilities.map((p, i) => `
      <div class="prob ${i === d.index ? 'top' : ''}" style="--c:${CLASS_COLORS[i]}">
        <span>${p.label}</span><div class="bar"><i data-w="${(p.value * 100).toFixed(1)}"></i></div><em>${(p.value * 100).toFixed(1)}%</em></div>`).join('');
    setTimeout(() => $$('#probs .bar i').forEach((b, i) => setTimeout(() => b.style.width = b.dataset.w + '%', i * 120)), 150);

    $('#info').innerHTML = `
      <div class="panel" style="--c:${c}"><h3>What this stage means</h3>${info.what_it_is.map(t => `<p>${t}</p>`).join('')}</div>
      <div class="panel" style="--c:${c}"><h3>What causes it</h3><ul>${li(info.causes)}</ul></div>
      <div class="panel pre" style="--c:${c}"><h3>Precautions and care</h3><ul>${li(info.precautions)}</ul></div>
      <div class="panel full" style="--c:${c}"><h3>When to see a doctor</h3><p>${info.see_doctor}</p>
        <button class="btn primary" id="findDocs" type="button" style="margin-top:14px">Find doctors for this stage</button></div>`;
    window.NetraLast = { index: d.index, label: d.label };
    $('#findDocs').onclick = () => window.NetraChat && window.NetraChat.open({ classIndex: d.index });
    $('#disclaimer').textContent = d.disclaimer;
    setTimeout(() => result.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250);
  }
})();
