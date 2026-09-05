# test/discrete-reference.json 생성 — R 판 (권장).
#
#   Rscript tools/make_discrete_reference.R
#
# 기하·음이항은 **시행 횟수** 관례를 쓴다.
#   R 의 dgeom/dnbinom 은 실패 횟수 관례이므로 k_시행 = k_실패 + r 로 옮겨 담는다.
#   (기하는 r = 1)

library(jsonlite)
ref <- list()

add <- function(id, params, k, pmf, cdf, mean, var) {
  ref[[length(ref) + 1]] <<- list(
    id = id,
    params = if (length(params) == 0) structure(list(), names = character(0)) else params,
    k = k, pmf = pmf, cdf = cdf, mean = mean, var = var
  )
}

# 베르누이
for (p in c(0.2, 0.5, 0.9)) {
  k <- 0:1
  add("bernoulli", list(p = p), k, dbinom(k, 1, p), pbinom(k, 1, p), p, p * (1 - p))
}

# 이항
for (par in list(c(10, 0.5), c(25, 0.2), c(100, 0.03), c(200, 0.7))) {
  n <- par[1]; p <- par[2]; k <- 0:n
  add("binomial", list(n = n, p = p), k, dbinom(k, n, p), pbinom(k, n, p), n * p, n * p * (1 - p))
}

# 기하 (시행 관례): k = 실패 + 1
for (p in c(0.1, 0.3, 0.7)) {
  hi <- qgeom(0.9999, p) + 1
  k <- 1:hi
  add("geometric", list(p = p), k, dgeom(k - 1, p), pgeom(k - 1, p), 1 / p, (1 - p) / p^2)
}

# 음이항 (시행 관례): k = 실패 + r
for (par in list(c(1, 0.3), c(3, 0.3), c(8, 0.6))) {
  r <- par[1]; p <- par[2]
  hi <- qnbinom(0.9999, r, p) + r
  k <- r:hi
  add("negbinomial", list(r = r, p = p), k, dnbinom(k - r, r, p), pnbinom(k - r, r, p),
      r / p, r * (1 - p) / p^2)
}

# 포아송
for (lam in c(0.5, 3, 15, 60)) {
  k <- 0:qpois(0.99999, lam)
  add("poisson", list(lambda = lam), k, dpois(k, lam), ppois(k, lam), lam, lam)
}

# 초기하 — R 의 dhyper(x, m = 성공, n = 실패, k = 뽑는 수)
for (par in list(c(50, 20, 10), c(30, 5, 12), c(200, 80, 40))) {
  N <- par[1]; K <- par[2]; n <- par[3]
  k <- max(0, n - (N - K)):min(n, K)
  mu <- n * K / N
  v <- n * (K / N) * (1 - K / N) * (N - n) / (N - 1)
  add("hypergeometric", list(N = N, K = K, n = n), k,
      dhyper(k, K, N - K, n), phyper(k, K, N - K, n), mu, v)
}

# 이산 균등
for (par in list(c(1, 6), c(0, 9), c(-3, 3))) {
  a <- par[1]; b <- par[2]; m <- b - a + 1; k <- a:b
  add("discreteUniform", list(a = a, b = b), k, rep(1 / m, m), (k - a + 1) / m,
      (a + b) / 2, (m^2 - 1) / 12)
}

dir.create("test", showWarnings = FALSE)
writeLines(toJSON(ref, digits = 15, auto_unbox = TRUE), "test/discrete-reference.json")
cat(length(ref), "blocks written to test/discrete-reference.json\n")
