#!/usr/bin/env python3
"""test/reference.json 생성 — scipy 판.

R 판(tools/make_reference.R)과 동일한 스키마를 만든다. 둘 중 하나만 실행하면 된다.
감마 계열은 rate 모수화임에 주의: scipy 는 scale 을 받으므로 scale = 1/lambda 로 넘긴다.
"""
import json
import os

import numpy as np
from scipy import stats

N_GRID = 41
OUT = os.path.join(os.path.dirname(__file__), '..', 'test', 'reference.json')

ref = []


def add(dist_id, params, rv, lo=None, hi=None, bounded=False):
    if bounded:
        a, b = lo, hi
        x = np.linspace(a + 1e-9, b - 1e-9, N_GRID)
    else:
        a = rv.ppf(1e-4) if lo is None else lo
        b = rv.ppf(1 - 1e-4) if hi is None else hi
        x = np.linspace(a, b, N_GRID)
    ref.append({
        'id': dist_id,
        'params': params,
        'x': [float(v) for v in x],
        'cdf': [float(v) for v in rv.cdf(x)],
    })


for mu, sd in [(0, 1), (1, 2), (-3, 0.5)]:
    add('normal', {'mu': mu, 'sigma': sd}, stats.norm(mu, sd))

add('stdnormal', {}, stats.norm(0, 1))

for mu, sd in [(0, 1), (1, 0.5)]:
    add('lognormal', {'mu': mu, 'sigma': sd}, stats.lognorm(s=sd, scale=np.exp(mu)), lo=1e-9)

# rate 모수화 → scipy scale = 1/lambda
for r, lam in [(0.5, 2), (1, 2), (4, 2), (8, 2), (20, 1)]:
    add('gamma', {'r': r, 'lambda': lam}, stats.gamma(a=r, scale=1 / lam), lo=1e-9)

for lam in [0.5, 1, 2]:
    add('exponential', {'lambda': lam}, stats.expon(scale=1 / lam), lo=1e-9)

for m in [1, 2, 5, 30]:
    add('chisq', {'m': m}, stats.chi2(df=m), lo=1e-9)

for a, b in [(0.5, 0.5), (1, 1), (2, 5), (5, 5)]:
    add('beta', {'alpha': a, 'beta': b}, stats.beta(a, b), lo=0, hi=1, bounded=True)

for n in [1, 2, 5, 30, 200]:
    add('t', {'n': n}, stats.t(df=n))

for r1, r2 in [(1, 1), (5, 10), (10, 50)]:
    add('f', {'r1': r1, 'r2': r2}, stats.f(r1, r2), lo=1e-9)

add('unif01', {}, stats.uniform(0, 1), lo=0, hi=1, bounded=True)
add('unifab', {'a': -2, 'b': 3}, stats.uniform(-2, 5), lo=-2, hi=3, bounded=True)

for x0, g in [(0, 1), (2, 0.5), (-1, 3)]:
    add('cauchy', {'x0': x0, 'gamma': g}, stats.cauchy(loc=x0, scale=g))

# Weibull 도 rate 계열 모수화: F(x) = 1 − exp(−a x^b) → scipy scale = a^(−1/b)
for a, b in [(1, 0.7), (1, 1), (1, 3), (2, 2)]:
    add('weibull', {'a': a, 'b': b}, stats.weibull_min(c=b, scale=a ** (-1 / b)), lo=1e-9)

# DE(0, λ): f(x) = (λ/2)e^(−λ|x|) → scipy laplace scale = 1/λ
for lam in [0.5, 1, 3]:
    add('dblexp', {'lambda': lam}, stats.laplace(loc=0, scale=1 / lam))

with open(OUT, 'w') as fh:
    json.dump(ref, fh)

print(f'{len(ref)} blocks, {sum(len(b["x"]) for b in ref)} points -> {OUT}')
