# test/reference.json 생성 — R 판 (권장).
#
#   Rscript tools/make_reference.R
#
# 감마 계열은 rate 모수화다. R 의 pgamma(x, shape = r, rate = lambda) 가 그대로 대응한다.
# scale 을 쓰면 안 된다 (PRD §11.2).

library(jsonlite)

N_GRID <- 41
ref <- list()

add <- function(id, params, x, p) {
  ref[[length(ref) + 1]] <<- list(
    id = id,
    params = if (length(params) == 0) structure(list(), names = character(0)) else params,
    x = x, cdf = p
  )
}

grid_q <- function(qfun) seq(qfun(1e-4), qfun(1 - 1e-4), length.out = N_GRID)
grid_b <- function(a, b) seq(a + 1e-9, b - 1e-9, length.out = N_GRID)

# 정규
for (p in list(c(0, 1), c(1, 2), c(-3, 0.5))) {
  x <- grid_q(function(q) qnorm(q, p[1], p[2]))
  add("normal", list(mu = p[1], sigma = p[2]), x, pnorm(x, p[1], p[2]))
}
x <- grid_q(qnorm); add("stdnormal", list(), x, pnorm(x))

# 로그정규
for (p in list(c(0, 1), c(1, 0.5))) {
  x <- seq(1e-9, qlnorm(1 - 1e-4, p[1], p[2]), length.out = N_GRID)
  add("lognormal", list(mu = p[1], sigma = p[2]), x, plnorm(x, p[1], p[2]))
}

# 감마 (rate)
for (p in list(c(0.5, 2), c(1, 2), c(4, 2), c(8, 2), c(20, 1))) {
  x <- seq(1e-9, qgamma(1 - 1e-4, shape = p[1], rate = p[2]), length.out = N_GRID)
  add("gamma", list(r = p[1], lambda = p[2]), x, pgamma(x, shape = p[1], rate = p[2]))
}

# 지수 (rate)
for (lam in c(0.5, 1, 2)) {
  x <- seq(1e-9, qexp(1 - 1e-4, rate = lam), length.out = N_GRID)
  add("exponential", list(lambda = lam), x, pexp(x, rate = lam))
}

# 카이제곱
for (m in c(1, 2, 5, 30)) {
  x <- seq(1e-9, qchisq(1 - 1e-4, df = m), length.out = N_GRID)
  add("chisq", list(m = m), x, pchisq(x, df = m))
}

# 베타
for (p in list(c(0.5, 0.5), c(1, 1), c(2, 5), c(5, 5))) {
  x <- grid_b(0, 1)
  add("beta", list(alpha = p[1], beta = p[2]), x, pbeta(x, p[1], p[2]))
}

# 이중지수의 분위수 (R 기본 패키지에 라플라스가 없어 직접 쓴다)
quantile_de <- function(q, lam) if (q < 0.5) log(2 * q) / lam else -log(2 * (1 - q)) / lam

# t
for (n in c(1, 2, 5, 30, 200)) {
  x <- grid_q(function(q) qt(q, df = n))
  add("t", list(n = n), x, pt(x, df = n))
}

# F
for (p in list(c(1, 1), c(5, 10), c(10, 50))) {
  x <- seq(1e-9, qf(1 - 1e-4, p[1], p[2]), length.out = N_GRID)
  add("f", list(r1 = p[1], r2 = p[2]), x, pf(x, p[1], p[2]))
}

# 균등
x <- grid_b(0, 1);  add("unif01", list(), x, punif(x))
x <- grid_b(-2, 3); add("unifab", list(a = -2, b = 3), x, punif(x, -2, 3))

# 코시
for (p in list(c(0, 1), c(2, 0.5), c(-1, 3))) {
  x <- grid_q(function(q) qcauchy(q, location = p[1], scale = p[2]))
  add("cauchy", list(x0 = p[1], gamma = p[2]), x, pcauchy(x, location = p[1], scale = p[2]))
}

# 와이블 — 이 사이트는 rate 계열 모수화: F(x) = 1 - exp(-a x^b), R 의 scale = a^(-1/b)
for (p in list(c(1, 0.7), c(1, 1), c(1, 3), c(2, 2))) {
  a <- p[1]; b <- p[2]; sc <- a^(-1 / b)
  x <- seq(1e-9, qweibull(1 - 1e-4, shape = b, scale = sc), length.out = N_GRID)
  add("weibull", list(a = a, b = b), x, pweibull(x, shape = b, scale = sc))
}

# 이중지수 DE(0, lambda): f(x) = (lambda/2) exp(-lambda|x|)
for (lam in c(0.5, 1, 3)) {
  x <- seq(-quantile_de(1e-4, lam), quantile_de(1e-4, lam), length.out = N_GRID)
  add("dblexp", list(lambda = lam), x, ifelse(x <= 0, 0.5 * exp(lam * x), 1 - 0.5 * exp(-lam * x)))
}

dir.create("test", showWarnings = FALSE)
writeLines(toJSON(ref, digits = 15, auto_unbox = TRUE), "test/reference.json")
cat(length(ref), "blocks written to test/reference.json\n")
