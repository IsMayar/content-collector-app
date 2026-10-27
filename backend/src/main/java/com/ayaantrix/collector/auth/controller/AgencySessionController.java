package com.ayaantrix.collector.auth.controller;
import com.ayaantrix.collector.auth.dto.*;
import com.ayaantrix.collector.auth.security.RefreshCookies;
import com.ayaantrix.collector.auth.service.*;
import com.ayaantrix.collector.common.error.ApiException;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.*;
import java.util.*;
@RestController
@RequestMapping(value="/api/v1",produces=MediaType.APPLICATION_JSON_VALUE)
public class AgencySessionController {
    private final AgencySessions sessions;private final RefreshCookies cookies;private final AccountRequestLimiter limits;
    private final CsrfTokenRepository csrf;private final int loginLimit;
    public AgencySessionController(AgencySessions sessions,RefreshCookies cookies,AccountRequestLimiter limits,
            CsrfTokenRepository csrf,@Value("${collector.auth.login-per-minute:10}") int loginLimit){
        if(loginLimit<1)throw new IllegalStateException("Invalid login rate configuration.");
        this.sessions=sessions;this.cookies=cookies;this.limits=limits;this.csrf=csrf;this.loginLimit=loginLimit;
    }
    @PostMapping(value="/auth/login",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<SessionResponses.Login> login(@Valid @RequestBody LoginRequest body,HttpServletRequest request,HttpServletResponse response){
        limits.check("LOGIN",request.getRemoteAddr(),loginLimit);
        var issued=sessions.login(body);cookies.set(response,issued.refreshToken(),issued.expiresAt());resetCsrf(request,response);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new SessionResponses.Login(issued.accessToken(),300,issued.user()));
    }
    @PostMapping(value="/auth/refresh",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<SessionResponses.Access> refresh(@RequestBody Map<String,Object> body,HttpServletRequest request,HttpServletResponse response){
        limits.check("REFRESH",request.getRemoteAddr(),60);
        try{var issued=sessions.refresh(cookies.read(request));cookies.set(response,issued.refreshToken(),issued.expiresAt());resetCsrf(request,response);
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new SessionResponses.Access(issued.accessToken(),300));
        }catch(ApiException invalid){if(invalid.getStatus()==HttpStatus.UNAUTHORIZED)cookies.clear(response);throw invalid;}
    }
    @PostMapping(value="/auth/logout",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> logout(@RequestBody(required=false) Map<String,Object> body,HttpServletRequest request,HttpServletResponse response){
        sessions.logout(cookies.read(request),request.getHeader("Authorization"));cookies.clear(response);resetCsrf(request,response);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
    @PostMapping(value="/auth/logout-all",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Void> logoutAll(@AuthenticationPrincipal Jwt jwt,HttpServletRequest request,HttpServletResponse response){
        sessions.logoutAll(jwt);cookies.clear(response);resetCsrf(request,response);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
    @GetMapping("/me") ResponseEntity<SessionResponses.Me> me(@AuthenticationPrincipal Jwt jwt){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(sessions.me(jwt));}
    @GetMapping("/me/sessions") ResponseEntity<Map<String,Object>> list(@AuthenticationPrincipal Jwt jwt){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(Map.of("data",sessions.list(jwt)));}
    @DeleteMapping("/me/sessions/{id}") ResponseEntity<Void> revoke(@AuthenticationPrincipal Jwt jwt,@PathVariable UUID id){sessions.revoke(jwt,id);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
    private void resetCsrf(HttpServletRequest request,HttpServletResponse response){
        if(request.getSession(false)!=null)request.changeSessionId();csrf.saveToken(null,request,response);
    }
}
