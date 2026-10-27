package com.ayaantrix.collector.auth.security;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.mock.web.*;
import java.time.*;
import static org.assertj.core.api.Assertions.*;
class RefreshCookiesTests {
    @Test void insecureCookiesAreRejectedOutsideLoopbackDev(){
        var prod=new MockEnvironment();assertThatThrownBy(()->new RefreshCookies(prod,Clock.systemUTC(),false)).isInstanceOf(IllegalStateException.class);
        var dev=new MockEnvironment();dev.setActiveProfiles("dev");dev.setProperty("server.address","0.0.0.0");
        assertThatThrownBy(()->new RefreshCookies(dev,Clock.systemUTC(),false)).isInstanceOf(IllegalStateException.class);
    }
    @Test void loopbackDevCookieUsesRestrictedPathWithoutSecurePrefix(){
        var dev=new MockEnvironment();dev.setActiveProfiles("dev");dev.setProperty("server.address","127.0.0.1");
        var now=Instant.parse("2026-10-27T00:00:00Z");var cookies=new RefreshCookies(dev,Clock.fixed(now,ZoneOffset.UTC),false);var response=new MockHttpServletResponse();
        cookies.set(response,"synthetic",now.plusSeconds(300));
        assertThat(response.getHeader("Set-Cookie")).startsWith("collector_refresh=").contains("HttpOnly","Path=/api/v1/auth","SameSite=Lax").doesNotContain("Secure");
    }
}
