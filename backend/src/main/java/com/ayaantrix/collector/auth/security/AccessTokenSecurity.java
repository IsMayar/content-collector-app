package com.ayaantrix.collector.auth.security;
import com.ayaantrix.collector.auth.service.AgencySessions;
import com.ayaantrix.collector.common.error.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.*;
import org.springframework.security.oauth2.server.resource.web.*;
import org.springframework.security.oauth2.server.resource.web.authentication.BearerTokenAuthenticationFilter;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.stereotype.Component;
import java.util.List;
@Component
public class AccessTokenSecurity {
    private final AccessTokens access;private final AgencySessions sessions;
    public AccessTokenSecurity(AccessTokens access,AgencySessions sessions){this.access=access;this.sessions=sessions;}
    public void configure(HttpSecurity http,SecurityProblemHandler problems){
        var provider=new JwtAuthenticationProvider(access);
        provider.setJwtAuthenticationConverter(jwt->{
            try{sessions.validateAccess(jwt);}catch(ApiException invalid){throw new InvalidBearerTokenException("Session unavailable.");}
            return new JwtAuthenticationToken(jwt,List.of());
        });
        var filter=new BearerTokenAuthenticationFilter(provider::authenticate);
        var resolver=new DefaultBearerTokenResolver();
        filter.setBearerTokenResolver(request->{
            // Cookie lifecycle must work even if the optional old bearer has expired.
            if("POST".equals(request.getMethod()) && List.of("/api/v1/auth/login","/api/v1/auth/refresh","/api/v1/auth/logout").contains(request.getRequestURI()))return null;
            return resolver.resolve(request);
        });
        filter.setAuthenticationEntryPoint(problems);
        // JWT authentication is request-only, never stored in the anti-CSRF HttpSession.
        filter.setSecurityContextRepository(new RequestAttributeSecurityContextRepository());
        http.addFilterBefore(filter,AnonymousAuthenticationFilter.class);
        // Keep the normal CSRF matcher: bearer writes receive no automatic exemption.
    }
}
