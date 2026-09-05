#!/usr/bin/env python3
"""test/discrete-reference.json 생성 — scipy 판.

R 판(tools/make_discrete_reference.R)과 같은 스키마를 만든다.
기하·음이항은 **시행 횟수** 관례임에 주의 (scipy nbinom 은 실패 횟수 관례이므로 k = 실패 + r).
"""
import json, os
from scipy import stats

OUT = os.path.join(os.path.dirname(__file__), '..', 'test', 'discrete-reference.json')
ref = []


def add(dist_id, params, rv, lo, hi):
    ks = list(range(lo, hi + 1))
    ref.append({
        'id': dist_id, 'params': params, 'k': ks,
        'pmf': [float(v) for v in rv.pmf(ks)],
        'cdf': [float(v) for v in rv.cdf(ks)],
        'mean': float(rv.mean()), 'var': float(rv.var()),
    })


for p in [0.2, 0.5, 0.9]:
    add('bernoulli', {'p': p}, stats.bernoulli(p), 0, 1)
for n, p in [(10, 0.5), (25, 0.2), (100, 0.03), (200, 0.7)]:
    add('binomial', {'n': n, 'p': p}, stats.binom(n, p), 0, n)
for p in [0.1, 0.3, 0.7]:
    add('geometric', {'p': p}, stats.geom(p), 1, int(stats.geom(p).ppf(0.9999)))
for r, p in [(1, 0.3), (3, 0.3), (8, 0.6)]:           # 시행 관례로 옮겨 담는다
    rv = stats.nbinom(r, p)
    ks = list(range(r, int(rv.ppf(0.9999)) + r + 1))
    ref.append({'id': 'negbinomial', 'params': {'r': r, 'p': p}, 'k': ks,
                'pmf': [float(rv.pmf(k - r)) for k in ks],
                'cdf': [float(rv.cdf(k - r)) for k in ks],
                'mean': float(rv.mean() + r), 'var': float(rv.var())})
for lam in [0.5, 3, 15, 60]:
    add('poisson', {'lambda': lam}, stats.poisson(lam), 0, int(stats.poisson(lam).ppf(0.99999)))
for N, K, n in [(50, 20, 10), (30, 5, 12), (200, 80, 40)]:
    add('hypergeometric', {'N': N, 'K': K, 'n': n}, stats.hypergeom(N, K, n),
        max(0, n - (N - K)), min(n, K))
for a, b in [(1, 6), (0, 9), (-3, 3)]:
    add('discreteUniform', {'a': a, 'b': b}, stats.randint(a, b + 1), a, b)

with open(OUT, 'w') as fh:
    json.dump(ref, fh)
print(f'{len(ref)} blocks, {sum(len(b["k"]) for b in ref)} points -> {OUT}')
