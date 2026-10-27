package com.ayaantrix.collector.auth.security;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.*;
@Component
public class RefreshCookies {
    private static final String PATH="/api/v1/auth";
    private final boolean secure;private final Clock clock;private final String name;
    public RefreshCookies(Environment environment,Clock clock,@Value("${collector.auth.cookie-secure:true}") boolean secure){
        this.secure=secure;this.clock=clock;
        if(!secure && !(Arrays.asList(environment.getActiveProfiles()).contains("dev")
                && List.of("127.0.0.1","localhost","::1").contains(environment.getProperty("server.address",""))))
            throw new IllegalStateException("Insecure refresh cookies require loopback-only development.");
        name=secure?"__Secure-collector_refresh":"collector_refresh";
    }
    public String read(HttpServletRequest request){
        var cookies=request.getCookies();if(cookies==null)return null;
        var matches=Arrays.stream(cookies).filter(c->name.equals(c.getName())).toList();
        return matches.size()==1?matches.getFirst().getValue():null;
    }
    public void set(HttpServletResponse response,String raw,Instant expires){write(response,raw,Duration.between(clock.instant(),expires));}
    public void clear(HttpServletResponse response){write(response,"",Duration.ZERO);}
    private void write(HttpServletResponse response,String value,Duration age){
        response.addHeader(HttpHeaders.SET_COOKIE,ResponseCookie.from(name,value).httpOnly(true).secure(secure)
                .sameSite("Lax").path(PATH).maxAge(age.isNegative()?Duration.ZERO:age).build().toString());
    }
}
