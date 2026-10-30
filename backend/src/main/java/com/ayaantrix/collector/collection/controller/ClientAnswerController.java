package com.ayaantrix.collector.collection.controller;
import com.ayaantrix.collector.collection.service.ClientAnswerService;
import com.ayaantrix.collector.collection.dto.ClientAnswerDtos.*;
import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.*;
import java.util.*;
@RestController @RequestMapping("/api/v1/client/projects/{project}/items/{item}")
public class ClientAnswerController {
 private final ClientAnswerService service;private final ClientSessionCookies cookies;
 public ClientAnswerController(ClientAnswerService service,ClientSessionCookies cookies){this.service=service;this.cookies=cookies;}
 @GetMapping ResponseEntity<Map<String,Object>> read(@PathVariable UUID project,@PathVariable UUID item,HttpServletRequest request){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.read(cookies.read(request),project,item));}
 @PutMapping(value="/answer",consumes=MediaType.APPLICATION_JSON_VALUE) ResponseEntity<Saved> save(@PathVariable UUID project,@PathVariable UUID item,@Valid @RequestBody Save input,HttpServletRequest request){return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.save(cookies.read(request),project,item,input));}
}
