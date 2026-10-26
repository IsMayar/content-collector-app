package com.ayaantrix.collector.auth.controller;

import com.ayaantrix.collector.auth.dto.*;
import com.ayaantrix.collector.auth.service.*;
import com.ayaantrix.collector.common.web.RequestTrace;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(value="/api/v1/auth",produces=MediaType.APPLICATION_JSON_VALUE)
public class AccountRegistrationController {
    public static final String REGISTRATION_MESSAGE="If this address can be registered, check your inbox for a verification email.";
    private final RegistrationService registration;
    private final EmailVerificationService verification;
    private final AccountRequestLimiter limits;
    private final RequestTrace trace;
    private final int registrationLimit;
    private final int verificationLimit;
    public AccountRegistrationController(RegistrationService registration,EmailVerificationService verification,
            AccountRequestLimiter limits,RequestTrace trace,
            @Value("${collector.auth.registration-per-minute:5}") int registrationLimit,
            @Value("${collector.auth.verification-per-minute:20}") int verificationLimit) {
        this.registration=registration;this.verification=verification;this.limits=limits;this.trace=trace;
        if (registrationLimit<1 || verificationLimit<1) throw new IllegalStateException("Invalid account rate configuration.");
        this.registrationLimit=registrationLimit;this.verificationLimit=verificationLimit;
    }
    @GetMapping("/csrf")
    ResponseEntity<AccountResponses.Csrf> csrf(CsrfToken token) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AccountResponses.Csrf(token.getToken()));
    }
    @PostMapping(value="/register",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<AccountResponses.Message> register(@Valid @RequestBody RegistrationRequest body,HttpServletRequest request) {
        limits.check("REGISTER",request.getRemoteAddr(),registrationLimit);
        registration.register(body,trace.getTraceId(request));
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(new AccountResponses.Message(REGISTRATION_MESSAGE));
    }
    @PostMapping(value="/verify-email",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<AccountResponses.Verified> verify(@Valid @RequestBody VerificationRequest body,HttpServletRequest request) {
        limits.check("VERIFY_EMAIL",request.getRemoteAddr(),verificationLimit);
        verification.verify(body.token());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AccountResponses.Verified(true));
    }
}
