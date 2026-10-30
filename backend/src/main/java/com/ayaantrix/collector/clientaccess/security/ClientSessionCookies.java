package com.ayaantrix.collector.clientaccess.security;
import jakarta.servlet.http.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.env.Environment;
import org.springframework.http.*;
import org.springframework.stereotype.Component;
import java.time.*;
import java.util.*;
@Component
public class ClientSessionCookies {
 private final boolean secure;private final String name;private final Clock clock;
 public ClientSessionCookies(Environment env,Clock clock,@Value("${collector.auth.cookie-secure:true}") boolean secure){this.secure=secure;this.clock=clock;if(!secure&&!(Arrays.asList(env.getActiveProfiles()).contains("dev")&&List.of("127.0.0.1","localhost","::1").contains(env.getProperty("server.address",""))))throw new IllegalStateException("Insecure client cookies require loopback development.");name=secure?"__Secure-collector_client":"collector_client";}
 public String read(HttpServletRequest request){if(request.getCookies()==null)return null;var cookies=Arrays.stream(request.getCookies()).filter(c->name.equals(c.getName())).toList();return cookies.size()==1?cookies.getFirst().getValue():null;}
 public void set(HttpServletResponse response,String raw,Instant expires){write(response,raw,Duration.between(clock.instant(),expires));}public void clear(HttpServletResponse response){write(response,"",Duration.ZERO);}
 private void write(HttpServletResponse response,String raw,Duration age){response.addHeader(HttpHeaders.SET_COOKIE,ResponseCookie.from(name,raw).httpOnly(true).secure(secure).sameSite("Lax").path("/api/v1").maxAge(age.isNegative()?Duration.ZERO:age).build().toString());}
}
