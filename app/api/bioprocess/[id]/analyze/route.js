export const dynamic = 'force-dynamic';
import { createClient } from '@/utils/supabase/server';
import { NextResponse } from 'next/server';

// ── PBD Design Matrix (run-major: DESIGN[run][factor], 12 runs × 11 factors) ──
const PBD_DESIGN = [
  [+1,+1,+1,-1,+1,+1,+1,-1,-1,-1,-1],
  [-1,+1,+1,+1,-1,+1,+1,+1,-1,-1,-1],
  [+1,-1,+1,+1,+1,-1,+1,+1,+1,-1,-1],
  [-1,+1,-1,+1,+1,+1,-1,+1,+1,+1,-1],
  [-1,-1,+1,-1,+1,+1,+1,-1,+1,+1,+1],
  [+1,-1,-1,+1,-1,+1,+1,+1,-1,+1,+1],
  [+1,+1,-1,-1,+1,-1,+1,+1,+1,-1,+1],
  [+1,+1,+1,-1,-1,+1,-1,+1,+1,+1,-1],
  [-1,+1,+1,+1,-1,-1,+1,-1,+1,+1,+1],
  [+1,-1,+1,+1,+1,-1,-1,+1,-1,+1,+1],
  [+1,+1,-1,+1,+1,+1,-1,-1,+1,-1,+1],
  [-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1],
];

// ── BBD Design Matrix (run-major: DESIGN[run][factor], 15 runs × 3 factors) ──
const BBD_DESIGN = [
  [-1,-1, 0], [+1,-1, 0], [-1,+1, 0], [+1,+1, 0],
  [-1, 0,-1], [+1, 0,-1], [-1, 0,+1], [+1, 0,+1],
  [ 0,-1,-1], [ 0,+1,-1], [ 0,-1,+1], [ 0,+1,+1],
  [ 0, 0, 0], [ 0, 0, 0], [ 0, 0, 0],
];

// ── Math Utilities ───────────────────────────────────────────────────────────
function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1);
}

// Regularised incomplete beta via Lentz continued fraction (for t-dist p-values)
function lnGamma(x) {
  const C = [76.18009172947146,-86.50532032941677,24.01409824083091,
             -1.231739572450155,0.1208650973866179e-2,-0.5395239384953e-5];
  let y = x, tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1.000000000190015;
  for (const c of C) ser += c / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}

function betainc(a, b, x) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  const lbeta = lnGamma(a) + lnGamma(b) - lnGamma(a + b);
  const front = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lbeta) / a;
  // Continued fraction via Lentz
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d; let h = d;
  for (let m = 1; m <= 200; m++) {
    let m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c; h *= del;
    if (Math.abs(del - 1) < 1e-10) break;
  }
  return front * h;
}

function tPValue(t, df) {
  const x = df / (df + t * t);
  return Math.min(1, betainc(df / 2, 0.5, x));
}

// F-distribution p-value (for RSM coefficient tests): P(F > f | df1, df2)
function fPValue(f, df1, df2) {
  if (f <= 0) return 1;
  const x = df2 / (df2 + df1 * f);
  return Math.min(1, betainc(df2 / 2, df1 / 2, x));
}

// Matrix operations (all row-major arrays of arrays)
function transpose(M) {
  return M[0].map((_, j) => M.map(row => row[j]));
}

function matMul(A, B) {
  const m = A.length, n = B[0].length, k = B.length;
  return Array.from({ length: m }, (_, i) =>
    Array.from({ length: n }, (_, j) =>
      A[i].reduce((s, v, l) => s + v * B[l][j], 0)));
}

function matVecMul(A, v) {
  return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0));
}

// Gaussian elimination with partial pivoting → solves Ax = b
function gaussElim(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    if (Math.abs(M[col][col]) < 1e-14) continue;
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n];
    for (let j = i + 1; j < n; j++) x[i] -= M[i][j] * x[j];
    x[i] /= M[i][i];
  }
  return x;
}

// Invert a symmetric positive-definite matrix via Gaussian elimination
function invertMatrix(A) {
  const n = A.length;
  const M = A.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)]);
  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r][col]) > Math.abs(M[maxRow][col])) maxRow = r;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-14) continue;
    for (let c = 0; c < 2 * n; c++) M[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col];
      for (let c = 0; c < 2 * n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map(row => row.slice(n));
}

// ── Welch t-test ─────────────────────────────────────────────────────────────
function welchTTest(g1, g2) {
  const n1 = g1.length, n2 = g2.length;
  const m1 = mean(g1), m2 = mean(g2);
  const v1 = variance(g1), v2 = variance(g2);
  const se = Math.sqrt(v1 / n1 + v2 / n2);
  if (se < 1e-14) return { effect: m1 - m2, t: 0, df: n1 + n2 - 2, p: 1 };
  const t = (m1 - m2) / se;
  const df = Math.max(1, Math.floor((v1 / n1 + v2 / n2) ** 2 /
    ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1))));
  return { effect: m1 - m2, t, df, p: tPValue(Math.abs(t), df) };
}

// ── PBD Analysis ─────────────────────────────────────────────────────────────
function analyzePBD(factors, responses) {
  const Y = responses.map(r => r.response);
  const nFactors = factors.length;
  const results = factors.map((f, fi) => {
    const hi = [], lo = [];
    for (let ri = 0; ri < 12; ri++) {
      (PBD_DESIGN[ri][fi] === 1 ? hi : lo).push(Y[ri]);
    }
    const { effect, t, df, p } = welchTTest(hi, lo);
    return { code: f.code, variable: f.variable, effect: +effect.toFixed(5),
             t: +t.toFixed(4), df, p: +p.toFixed(5), significant: p < 0.05 };
  });
  const significant = results.filter(r => r.significant);
  return { type: 'pbd', results, significant, nFactors };
}

// ── RSM Analysis ─────────────────────────────────────────────────────────────
function analyzeRSM(factors, responses) {
  const Y = responses.map(r => r.response);
  const n = 15, p = 10;
  // Build design matrix (include intercept + linear + quadratic + interactions)
  const X = BBD_DESIGN.map(([x1, x2, x3]) =>
    [1, x1, x2, x3, x1*x1, x2*x2, x3*x3, x1*x2, x1*x3, x2*x3]);
  const termNames = ['β0','β1','β2','β3','β11','β22','β33','β12','β13','β23'];

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtY = matVecMul(Xt, Y);
  const beta = gaussElim(XtX, XtY);

  const fitted = X.map(row => row.reduce((s, v, j) => s + v * beta[j], 0));
  const yMean = mean(Y);
  const SST = Y.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const SSE = Y.reduce((s, y, i) => s + (y - fitted[i]) ** 2, 0);
  const r2 = +(1 - SSE / SST).toFixed(5);
  const adjR2 = +(1 - (SSE / (n - p)) / (SST / (n - 1))).toFixed(5);
  const MSE = SSE / (n - p);

  // Coefficient p-values using (X'X)^-1 diagonal
  const XtXinv = invertMatrix(XtX);
  const coefs = beta.map((b, j) => {
    const se = Math.sqrt(Math.max(0, MSE * XtXinv[j][j]));
    const t = se > 1e-14 ? b / se : 0;
    const pv = tPValue(Math.abs(t), n - p);
    return { term: termNames[j], beta: +b.toFixed(5), se: +se.toFixed(5),
             t: +t.toFixed(4), p: +pv.toFixed(5), significant: pv < 0.05 };
  });

  // Lack of fit: center points are runs 13-15 (idx 12-14)
  const centerY = Y.slice(12, 15);
  const centerMean = mean(centerY);
  const SSPE = centerY.reduce((s, y) => s + (y - centerMean) ** 2, 0); // pure error
  const SSLOF = SSE - SSPE;
  const dfLOF = n - p - 2; // 15-10-2 = 3 pure error df from 3 center pts (df_pure=2)
  const MSLOF = dfLOF > 0 ? SSLOF / dfLOF : 0;
  const MSPE = SSPE > 0 ? SSPE / 2 : 1e-10;
  const FLOF = MSLOF / MSPE;
  const pLOF = +fPValue(FLOF, dfLOF, 2).toFixed(5);

  // Find stationary point: solve 2B*x = -b (gradient = 0)
  // Bmatrix: [[2β11, β12, β13], [β12, 2β22, β23], [β13, β23, 2β33]]
  const bVec = [beta[1], beta[2], beta[3]];
  const Bmat = [
    [2*beta[4], beta[7],   beta[8]],
    [beta[7],   2*beta[5], beta[9]],
    [beta[8],   beta[9],   2*beta[6]],
  ];
  let xOpt;
  try {
    xOpt = gaussElim(Bmat, bVec.map(v => -v));
  } catch {
    xOpt = [0, 0, 0];
  }
  // Clamp to coded range [-1, 1]
  const xClamped = xOpt.map(v => Math.max(-1, Math.min(1, v)));
  const predOpt = [1, ...xClamped,
    xClamped[0]**2, xClamped[1]**2, xClamped[2]**2,
    xClamped[0]*xClamped[1], xClamped[0]*xClamped[2], xClamped[1]*xClamped[2]
  ].reduce((s, v, j) => s + v * beta[j], 0);

  // Actual optimal values
  const actualOpt = (factors.length >= 3)
    ? [0, 1, 2].map(i => {
        const f = factors[i];
        return +(f.center_value + xClamped[i] * (f.high_value - f.low_value) / 2).toFixed(3);
      })
    : xClamped;

  // Surface heatmap (20x20 grid, x3 held at 0)
  const G = 20;
  const heatmap = Array.from({ length: G }, (_, i) =>
    Array.from({ length: G }, (_, j) => {
      const x1 = -1 + 2 * i / (G - 1), x2 = -1 + 2 * j / (G - 1);
      return +(beta[0] + beta[1]*x1 + beta[2]*x2 + beta[4]*x1*x1
               + beta[5]*x2*x2 + beta[7]*x1*x2).toFixed(4);
    }));

  // ANOVA table
  const SSModel = SST - SSE;
  const dfModel = p - 1;
  const dfResidual = n - p;
  const MSModel = SSModel / dfModel;
  const FModel = MSE > 1e-14 ? MSModel / MSE : 0;
  const pModel = +fPValue(FModel, dfModel, dfResidual).toFixed(5);
  const diagnostics = Array.from({ length: n }, (_, i) => ({
    run: i + 1, actual: +Y[i].toFixed(4),
    fitted: +fitted[i].toFixed(4), residual: +(Y[i] - fitted[i]).toFixed(4),
  }));

  return {
    type: 'rsm', coefs, r2, adjR2, MSE: +MSE.toFixed(5),
    lackOfFit: { F: +FLOF.toFixed(4), p: pLOF, adequate: pLOF > 0.05 },
    stationary: { coded: xOpt.map(v => +v.toFixed(4)), clamped: xClamped.map(v => +v.toFixed(4)) },
    actualOpt, predictedResponse: +predOpt.toFixed(4), heatmap,
    anova: {
      model:    { SS: +SSModel.toFixed(4), df: dfModel,    MS: +MSModel.toFixed(4), F: +FModel.toFixed(4), p: pModel },
      residual: { SS: +SSE.toFixed(4),     df: dfResidual, MS: +MSE.toFixed(5) },
      lof:      { SS: +SSLOF.toFixed(4),   df: dfLOF,      MS: +MSLOF.toFixed(4), F: +FLOF.toFixed(4),   p: pLOF },
      pureErr:  { SS: +SSPE.toFixed(4),    df: 2,          MS: +MSPE.toFixed(4) },
      total:    { SS: +SST.toFixed(4),     df: n - 1 },
    },
    diagnostics,
  };
}

// ── Kinetics Analysis ────────────────────────────────────────────────────────
// Gauss-Newton for 2-parameter curve: y = p0 * x / (p1 + x)
function fitHyperbola(xArr, yArr, p0init, p1init) {
  let p = [p0init, p1init];
  for (let iter = 0; iter < 500; iter++) {
    const J = xArr.map(x => [x / (p[1] + x), -p[0] * x / (p[1] + x) ** 2]);
    const resid = xArr.map((x, i) => yArr[i] - p[0] * x / (p[1] + x));
    const Jt = transpose(J);
    const JtJ = matMul(Jt, J);
    const Jtr = matVecMul(Jt, resid);
    // Levenberg damping
    for (let k = 0; k < 2; k++) JtJ[k][k] *= 1.001;
    const delta = gaussElim(JtJ, Jtr);
    p = [Math.max(1e-9, p[0] + delta[0]), Math.max(1e-9, p[1] + delta[1])];
    if (Math.abs(delta[0]) + Math.abs(delta[1]) < 1e-10) break;
  }
  const yMean = mean(yArr);
  const fitted = xArr.map(x => p[0] * x / (p[1] + x));
  const SST = yArr.reduce((s, y) => s + (y - yMean) ** 2, 0);
  const SSE = yArr.reduce((s, y, i) => s + (y - fitted[i]) ** 2, 0);
  const r2 = SST > 0 ? +(1 - SSE / SST).toFixed(5) : 0;
  return { params: p.map(v => +v.toFixed(6)), fitted: fitted.map(v => +v.toFixed(5)), r2 };
}

// RK4 ODE integration for Luedeking-Piret batch
function simulateBatch(t0, tend, dt, X0, S0, P0, muMax, Ks, Yxs, alpha, beta) {
  const times = [], Xv = [], Sv = [], Pv = [];
  let t = t0, X = X0, S = S0, P = P0;
  while (t <= tend + 1e-9) {
    times.push(+t.toFixed(3)); Xv.push(+X.toFixed(5)); Sv.push(+S.toFixed(5)); Pv.push(+P.toFixed(5));
    const rk = (state) => {
      const [x, s] = state; const ss = Math.max(0, s);
      const mu = muMax * ss / (Ks + ss);
      return [mu * x, -mu * x / Yxs, alpha * mu * x + beta * x];
    };
    const k1 = rk([X, S, P]);
    const k2 = rk([X + dt/2*k1[0], S + dt/2*k1[1], P + dt/2*k1[2]]);
    const k3 = rk([X + dt/2*k2[0], S + dt/2*k2[1], P + dt/2*k2[2]]);
    const k4 = rk([X + dt*k3[0],   S + dt*k3[1],   P + dt*k3[2]]);
    X = Math.max(0, X + dt/6*(k1[0]+2*k2[0]+2*k3[0]+k4[0]));
    S = Math.max(0, S + dt/6*(k1[1]+2*k2[1]+2*k3[1]+k4[1]));
    P = Math.max(0, P + dt/6*(k1[2]+2*k2[2]+2*k3[2]+k4[2]));
    t += dt;
  }
  return { times, X: Xv, S: Sv, P: Pv };
}

function analyzeKinetics(config, kineticData) {
  const modelType = config?.kinetics_model || 'monod';

  if (modelType === 'monod' || modelType === 'michaelis_menten') {
    const pts = kineticData.filter(d => d.substrate != null && d.rate != null);
    if (pts.length < 3) throw new Error('At least 3 data points required');
    pts.sort((a, b) => a.substrate - b.substrate);
    const S = pts.map(d => d.substrate);
    const mu = pts.map(d => d.rate);
    const mu0 = Math.max(...mu);
    const Ks0 = S[Math.floor(S.length / 2)];
    const fit = fitHyperbola(S, mu, mu0, Ks0);
    const [muMax, Ks] = fit.params;
    const doublingTime = modelType === 'monod' ? +(Math.log(2) / muMax).toFixed(3) : null;
    // Lineweaver-Burk points
    const lwb = pts.map(d => ({ invS: +(1/d.substrate).toFixed(4), invR: +(1/d.rate).toFixed(4) }));
    // Fitted curve for chart
    const sMax = Math.max(...S) * 1.1;
    const curve = Array.from({ length: 50 }, (_, i) => {
      const s = (i + 1) * sMax / 50;
      return { s: +s.toFixed(3), fitted: +(muMax * s / (Ks + s)).toFixed(5) };
    });
    return { type: 'kinetics', modelType, muMax, Ks, r2: fit.r2, doublingTime, curve, lwb,
             rawPts: pts.map(d => ({ s: d.substrate, r: d.rate })) };
  }

  if (modelType === 'luedeking_piret') {
    const cfg = config || {};
    const timePts = kineticData
      .filter(d => d.time_h != null && d.biomass != null && d.biomass > 0)
      .sort((a, b) => a.time_h - b.time_h);

    let muMax, Ks, Yxs, alpha, beta, fittedFromData = false;

    if (timePts.length >= 4) {
      // Numerical derivatives via central differences
      const nPts = timePts.length;
      const dXdt = timePts.map((pt, i) => {
        if (i === 0) return (timePts[1].biomass - pt.biomass) / Math.max(timePts[1].time_h - pt.time_h, 1e-9);
        if (i === nPts - 1) return (pt.biomass - timePts[nPts - 2].biomass) / Math.max(pt.time_h - timePts[nPts - 2].time_h, 1e-9);
        return (timePts[i + 1].biomass - timePts[i - 1].biomass) / Math.max(timePts[i + 1].time_h - timePts[i - 1].time_h, 1e-9);
      });

      // Specific growth rate mu(t) = dX/dt / X
      const mu = timePts.map((pt, i) => Math.max(0, dXdt[i] / pt.biomass));
      muMax = Math.max(...mu.filter(v => isFinite(v)), 0.01);

      // Fit Monod to substrate data if available
      const subPts = timePts.filter(d => d.substrate != null && d.substrate > 0);
      if (subPts.length >= 3) {
        const subS = subPts.map(d => d.substrate);
        const subMu = subPts.map(d => mu[timePts.indexOf(d)]).filter(v => isFinite(v) && v > 0);
        if (subMu.length >= 3) {
          try {
            const fit = fitHyperbola(subS.slice(0, subMu.length), subMu, muMax, subS[Math.floor(subS.length / 2)]);
            muMax = fit.params[0];
            Ks = fit.params[1];
          } catch { Ks = +(cfg.Ks || 2); }
        } else { Ks = +(cfg.Ks || 2); }

        // Yield Yx/s from overall delta X / delta S
        const dX = timePts[nPts - 1].biomass - timePts[0].biomass;
        const s0 = subPts[0].substrate, sF = subPts[subPts.length - 1].substrate;
        const dS = s0 - sF;
        Yxs = dS > 0.01 ? Math.min(2, +(dX / dS).toFixed(4)) : +(cfg.Yxs || 0.45);
      } else {
        Ks = +(cfg.Ks || 2);
        Yxs = +(cfg.Yxs || 0.45);
      }

      // Fit alpha (growth-assoc.) and beta (non-growth-assoc.) from product data via OLS
      // Model: dP/dt = alpha * dX/dt + beta * X
      const prodPts = timePts.filter(d => d.product != null);
      if (prodPts.length >= 4) {
        const pN = prodPts.length;
        const dPdt = prodPts.map((pt, i) => {
          if (i === 0) return (prodPts[1].product - pt.product) / Math.max(prodPts[1].time_h - pt.time_h, 1e-9);
          if (i === pN - 1) return (pt.product - prodPts[pN - 2].product) / Math.max(pt.time_h - prodPts[pN - 2].time_h, 1e-9);
          return (prodPts[i + 1].product - prodPts[i - 1].product) / Math.max(prodPts[i + 1].time_h - prodPts[i - 1].time_h, 1e-9);
        });
        const u = prodPts.map(pt => dXdt[timePts.indexOf(pt)] || 0); // dX/dt
        const v = prodPts.map(pt => pt.biomass);                      // X
        const y = dPdt;
        const Suu = u.reduce((s, ui) => s + ui * ui, 0);
        const Suv = u.reduce((s, ui, i) => s + ui * v[i], 0);
        const Svv = v.reduce((s, vi) => s + vi * vi, 0);
        const Suy = u.reduce((s, ui, i) => s + ui * y[i], 0);
        const Svy = v.reduce((s, vi, i) => s + vi * y[i], 0);
        const det = Suu * Svv - Suv * Suv;
        if (Math.abs(det) > 1e-14) {
          alpha = Math.max(0, (Svv * Suy - Suv * Svy) / det);
          beta  = Math.max(0, (Suu * Svy - Suv * Suy) / det);
          fittedFromData = true;
        } else {
          alpha = +(cfg.alpha || 0.15); beta = +(cfg.beta_lp || 0.05);
        }
      } else {
        alpha = +(cfg.alpha || 0.15); beta = +(cfg.beta_lp || 0.05);
      }
    } else {
      muMax = +(cfg.mu_max || 0.3); Ks = +(cfg.Ks || 2);
      Yxs = +(cfg.Yxs || 0.45); alpha = +(cfg.alpha || 0.15); beta = +(cfg.beta_lp || 0.05);
    }

    const X0 = +(cfg.X0 || (timePts[0]?.biomass   || 0.05));
    const S0 = +(cfg.S0 || (timePts[0]?.substrate  || 20));
    const P0 = +(cfg.P0 || (timePts[0]?.product    || 0));
    const tend = +(cfg.tend || (timePts[timePts.length - 1]?.time_h || 30));
    const sim = simulateBatch(0, tend, 0.1, X0, S0, P0, muMax, Ks, Yxs, alpha, beta);
    const dominant = alpha > 5 * beta ? 'growth-associated' : beta > 5 * alpha ? 'non-growth-associated' : 'mixed';
    const expPts = timePts.map(d => ({ t: d.time_h, X: d.biomass, S: d.substrate, P: d.product }));
    return {
      type: 'kinetics', modelType,
      muMax: +muMax.toFixed(4), Ks: +Ks.toFixed(4), Yxs: +Yxs.toFixed(4),
      alpha: +alpha.toFixed(4), beta: +beta.toFixed(4),
      dominant, simulation: sim, expPts, fittedFromData,
    };
  }

  throw new Error('Unknown kinetics model type');
}

// ── Interpretation Generator ─────────────────────────────────────────────────
function generateInterpretation(result, factors, experiment) {
  if (result.type === 'pbd') {
    const sig = result.significant;
    const total = result.nFactors;
    const lines = [`${sig.length} out of ${total} factor${total !== 1 ? 's' : ''} tested are statistically significant (p < 0.05).`];
    if (sig.length === 0)
      lines.push('No factors reached significance. Consider widening factor ranges by ±30–50% and repeating PBD.');
    else {
      const sorted = [...sig].sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
      const top = sorted[0];
      lines.push(`The most influential factor is ${top.variable} (${top.code}), with an effect of ${top.effect > 0 ? '+' : ''}${top.effect.toFixed(4)}. This means increasing ${top.variable} from its low to high level ${top.effect > 0 ? 'increases' : 'decreases'} the response by approximately ${Math.abs(top.effect).toFixed(4)} ${experiment.response_unit || 'units'} on average.`);
      const pos = sig.filter(f => f.effect > 0).map(f => f.variable);
      const neg = sig.filter(f => f.effect < 0).map(f => f.variable);
      if (pos.length) lines.push(`Factors where higher levels improve the response: ${pos.join(', ')}.`);
      if (neg.length) lines.push(`Factors where lower levels improve the response: ${neg.join(', ')}.`);
      lines.push(`Carry forward these ${sig.length} significant factor${sig.length !== 1 ? 's' : ''} to Response Surface Methodology (RSM) to find the precise optimum concentrations.`);
      if (sig.length > 5) lines.push('More than 5 factors are significant — consider narrowing ranges or using a stricter threshold (p < 0.01) before proceeding to RSM.');
    }
    return lines;
  }

  if (result.type === 'rsm') {
    const lines = [];
    lines.push(`Model fit: R² = ${result.r2} (${(result.r2 * 100).toFixed(1)}% of response variation explained). ${result.r2 >= 0.9 ? 'This exceeds the minimum acceptable threshold of R² ≥ 0.90.' : 'This is below the acceptable threshold of R² ≥ 0.90 — consider adding centre-point replicates or widening factor ranges.'}`);
    lines.push(`Adjusted R² = ${result.adjR2}. ${result.lackOfFit.adequate ? 'Lack-of-fit test is non-significant (p = ' + result.lackOfFit.p + '), confirming the model fits the data adequately.' : 'Lack-of-fit test is significant (p = ' + result.lackOfFit.p + '), suggesting the model may not fully capture the response surface — consider additional runs or a wider design.'}`);
    const sigQ = result.coefs.filter(c => ['β11','β22','β33'].includes(c.term) && c.significant);
    if (sigQ.length > 0) lines.push(`Significant quadratic terms: ${sigQ.map(c => c.term).join(', ')}. This confirms a genuine curved optimum (maximum or minimum) exists within the tested range.`);
    if (factors.length >= 3) {
      lines.push(`Predicted optimal conditions: ${factors.map((f, i) => `${f.variable} = ${result.actualOpt[i]} ${f.unit || ''}`).join(', ')}. Predicted response at optimum: ${result.predictedResponse} ${experiment.response_unit || ''}.`);
    }
    lines.push('Validate this optimum with 2–3 confirmation experiments comparing predicted vs actual response before scaling up.');
    return lines;
  }

  if (result.type === 'kinetics') {
    const lines = [];
    if (result.modelType === 'monod') {
      lines.push(`Maximum specific growth rate (μmax) = ${result.muMax} h⁻¹. Doubling time at non-limiting substrate = ${result.doublingTime} h.`);
      lines.push(`Half-saturation constant (Ks) = ${result.Ks} g/L. ${result.Ks < 1 ? 'Low Ks indicates high substrate affinity — the organism reaches near-maximal growth rate even at low substrate concentrations.' : result.Ks < 5 ? 'Moderate substrate affinity.' : 'High Ks indicates relatively low substrate affinity — significant substrate concentration is needed to achieve near-maximal growth.'}`);
      lines.push(`Model fit: R² = ${result.r2}. ${result.r2 >= 0.95 ? 'Excellent fit.' : result.r2 >= 0.90 ? 'Acceptable fit.' : 'Poor fit — consider checking for substrate inhibition (Andrews model) or measurement errors at extreme concentrations.'}`);
    } else if (result.modelType === 'michaelis_menten') {
      lines.push(`Maximum reaction rate (Vmax) = ${result.muMax} units. Michaelis constant (Km) = ${result.Ks} mM.`);
      lines.push(`${result.Ks < 1 ? 'Low Km: the enzyme has high affinity for its substrate.' : result.Ks < 10 ? 'Moderate enzyme-substrate affinity.' : 'High Km: the enzyme requires high substrate concentrations to achieve near-maximal activity.'}`);
      lines.push('If the Lineweaver-Burk plot shows curvature, product inhibition or substrate inhibition may be present — consider the Eadie-Hofstee plot for better parameter estimation.');
    } else if (result.modelType === 'luedeking_piret') {
      lines.push(`Luedeking-Piret classification: product formation is ${result.dominant}.`);
      if (result.dominant === 'growth-associated') lines.push('Harvest strategy: maximise growth rate during exponential phase. Conditions that slow growth (pH deviations, dissolved oxygen limitations) will reduce product titer.');
      else if (result.dominant === 'non-growth-associated') lines.push('Harvest strategy: maximise total biomass first (growth phase), then shift to production conditions maintaining high cell density. Product accumulates in the stationary phase.');
      else lines.push('Mixed kinetics: both growth rate and cell density contribute to product accumulation. Optimise for a balance between growth phase duration and stationary phase hold.');
      lines.push(`Fitted parameters: μmax = ${result.muMax} h⁻¹, Ks = ${result.Ks} g/L, Yx/s = ${result.Yxs}, α = ${result.alpha} (growth-assoc.), β = ${result.beta} (non-growth-assoc.).`);
    }
    return lines;
  }

  return ['Analysis complete.'];
}

// ── Route Handler ────────────────────────────────────────────────────────────
export async function POST(req, { params }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const [expRes, factorsRes, responsesRes, kineticsRes] = await Promise.all([
    supabase.from('bioprocess_experiments').select('*').eq('id', id).single(),
    supabase.from('bioprocess_factors').select('*').eq('experiment_id', id).order('position'),
    supabase.from('bioprocess_responses').select('*').eq('experiment_id', id).order('run_number'),
    supabase.from('bioprocess_kinetics_data').select('*').eq('experiment_id', id).order('sort_order'),
  ]);

  if (expRes.error) return NextResponse.json({ error: 'Experiment not found' }, { status: 404 });
  const experiment = expRes.data;
  const factors = factorsRes.data || [];
  const responses = responsesRes.data || [];
  const kineticData = kineticsRes.data || [];

  let result;
  try {
    if (experiment.type === 'pbd') {
      if (factors.length === 0) throw new Error('Define at least 1 factor before analysis');
      const filled = responses.slice(0, 12).filter(r => r.response != null);
      if (filled.length < 12) throw new Error(`Enter all 12 run responses (${filled.length}/12 complete)`);
      result = analyzePBD(factors, responses.slice(0, 12));
    } else if (experiment.type === 'rsm') {
      if (factors.length < 3) throw new Error('RSM requires exactly 3 factors defined');
      const filled = responses.slice(0, 15).filter(r => r.response != null);
      if (filled.length < 15) throw new Error(`Enter all 15 run responses (${filled.length}/15 complete)`);
      result = analyzeRSM(factors, responses.slice(0, 15));
    } else if (experiment.type === 'kinetics') {
      result = analyzeKinetics(experiment.config, kineticData);
    } else {
      throw new Error('Unknown experiment type');
    }

    result.interpretation = generateInterpretation(result, factors, experiment);

    // Persist result
    await supabase.from('bioprocess_experiments').update({
      analysis_result: result,
      status: 'complete',
      updated_at: new Date().toISOString(),
    }).eq('id', id);

  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }

  return NextResponse.json({ result });
}
