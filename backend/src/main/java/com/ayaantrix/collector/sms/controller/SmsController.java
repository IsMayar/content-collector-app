package com.ayaantrix.collector.sms.controller;

import com.ayaantrix.collector.clientaccess.security.ClientSessionCookies;
import com.ayaantrix.collector.sms.dto.SmsDtos.*;
import com.ayaantrix.collector.sms.service.SmsService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/v1/client/projects/{p}/sms")
public class SmsController {
    private final SmsService service;
    private final ClientSessionCookies cookies;

    public SmsController(SmsService service, ClientSessionCookies cookies) {
        this.service = service;
        this.cookies = cookies;
    }

    @PostMapping("/verification")
    ResponseEntity<?> start(
            @PathVariable UUID p,
            @Valid @RequestBody Start body,
            @RequestHeader("Idempotency-Key") String key,
            HttpServletRequest request) {
        return ResponseEntity.accepted()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("verificationId", service.start(cookies.read(request), p, body, key)));
    }

    @PostMapping("/verification/confirm")
    ResponseEntity<?> confirm(
            @PathVariable UUID p, @Valid @RequestBody Confirm body, HttpServletRequest request) {
        String state = service.confirm(cookies.read(request), p, body);
        if (state.equals("INVALID_CODE"))
            throw new com.ayaantrix.collector.common.error.ApiException(
                    HttpStatus.UNPROCESSABLE_ENTITY,
                    "SMS_INVALID_CODE",
                    "The verification code is incorrect.");
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("smsStatus", state));
    }

    @DeleteMapping("/consent")
    ResponseEntity<?> withdraw(@PathVariable UUID p, HttpServletRequest request) {
        service.withdraw(cookies.read(request), p);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
    }
}
