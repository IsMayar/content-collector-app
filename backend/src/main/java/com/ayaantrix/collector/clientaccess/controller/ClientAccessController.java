package com.ayaantrix.collector.clientaccess.controller;
import com.ayaantrix.collector.clientaccess.service.*;
import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;
import com.ayaantrix.collector.clientaccess.dto.ClientAccessDtos.*;
import com.ayaantrix.collector.auth.service.AccountRequestLimiter;
import com.ayaantrix.collector.common.web.RequestTrace;
import com.ayaantrix.collector.common.error.ApiException;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.http.*;
import java.util.*;
@RestController @RequestMapping(value="/api/v1",produces=MediaType.APPLICATION_JSON_VALUE)
public class ClientAccessController {
 private final ClientAccessService access;private final ClientPortalService portal;private final ClientSessionCookies cookies;private final AccountRequestLimiter limits;private final RequestTrace trace;private final CsrfTokenRepository csrf;
 public ClientAccessController(ClientAccessService access,ClientPortalService portal,ClientSessionCookies cookies,AccountRequestLimiter limits,RequestTrace trace,CsrfTokenRepository csrf){this.access=access;this.portal=portal;this.cookies=cookies;this.limits=limits;this.trace=trace;this.csrf=csrf;}
 @PostMapping("/workspaces/{workspace}/projects/{project}/contacts/{contact}/invite")
 ResponseEntity<Map<String,Invitation>> invite(@PathVariable UUID workspace,@PathVariable UUID project,@PathVariable UUID contact,@RequestHeader("Idempotency-Key") String key,HttpServletRequest request){return ResponseEntity.status(202).cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").body(Map.of("invitation",access.invite(workspace,project,contact,key,trace.getTraceId(request))));}
 @DeleteMapping("/workspaces/{workspace}/projects/{project}/contacts/{contact}/access")
 ResponseEntity<Void> revoke(@PathVariable UUID workspace,@PathVariable UUID project,@PathVariable UUID contact){access.revoke(workspace,project,contact);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
 @PostMapping(value="/client-access/exchange",consumes=MediaType.APPLICATION_JSON_VALUE)
 ResponseEntity<Access> exchange(@Valid @RequestBody Exchange input,HttpServletRequest request,HttpServletResponse response){limits.check("CLIENT_EXCHANGE",request.getRemoteAddr(),30);var issued=access.exchange(input,cookies.read(request));cookies.set(response,issued.credential(),issued.expiresAt());resetCsrf(request,response);return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").body(new Access(issued.projectId(),issued.expiresAt()));}
 @PostMapping(value="/client-access/request-link",consumes=MediaType.APPLICATION_JSON_VALUE)
 ResponseEntity<Map<String,String>> request(@Valid @RequestBody RequestLink input,HttpServletRequest request){limits.check("CLIENT_LINK_IP",request.getRemoteAddr(),10);limits.check("CLIENT_LINK_TARGET",input.projectId()+":"+input.email().strip().toLowerCase(Locale.ROOT),3);access.request(input,trace.getTraceId(request));return ResponseEntity.status(202).cacheControl(CacheControl.noStore()).body(Map.of("message","If this address has active access, a new link will be emailed. Please check your inbox."));}
 @PostMapping("/client-access/logout") ResponseEntity<Void> logout(HttpServletRequest request,HttpServletResponse response){access.logout(cookies.read(request));cookies.clear(response);resetCsrf(request,response);return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();}
 @GetMapping("/client/projects/{project}/checklist") ResponseEntity<Map<String,Object>> checklist(@PathVariable UUID project,HttpServletRequest request,HttpServletResponse response){try{return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy","no-referrer").body(portal.checklist(cookies.read(request),project));}catch(ApiException e){if(e.getStatus()==HttpStatus.UNAUTHORIZED)cookies.clear(response);throw e;}}
 private void resetCsrf(HttpServletRequest request,HttpServletResponse response){if(request.getSession(false)!=null)request.changeSessionId();csrf.saveToken(null,request,response);}
}
