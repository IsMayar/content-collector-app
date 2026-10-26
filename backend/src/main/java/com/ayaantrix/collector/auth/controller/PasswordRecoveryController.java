package com.ayaantrix.collector.auth.controller;

import com.ayaantrix.collector.auth.dto.*;
import com.ayaantrix.collector.auth.service.*;
import com.ayaantrix.collector.common.web.RequestTrace;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping(value="/api/v1/auth",produces=MediaType.APPLICATION_JSON_VALUE)
public class PasswordRecoveryController {
    public static final String RECOVERY_MESSAGE="If an eligible account exists, a password reset link will be sent.";
    private final PasswordRecoveryService recovery;
    private final PasswordResetService reset;
    private final AccountRequestLimiter limits;
    private final RequestTrace trace;
    private final int recoveryLimit;
    private final int resetLimit;
    public PasswordRecoveryController(PasswordRecoveryService recovery,PasswordResetService reset,AccountRequestLimiter limits,
            RequestTrace trace,@Value("${collector.auth.recovery-per-minute:5}") int recoveryLimit,
            @Value("${collector.auth.reset-per-minute:20}") int resetLimit) {
        this.recovery=recovery;this.reset=reset;this.limits=limits;this.trace=trace;
        if(recoveryLimit<1 || resetLimit<1)throw new IllegalStateException("Invalid account rate configuration.");
        this.recoveryLimit=recoveryLimit;this.resetLimit=resetLimit;
    }
    @PostMapping(value="/forgot-password",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<AccountResponses.Message> recover(@Valid @RequestBody RecoveryRequest request,HttpServletRequest servlet) {
        limits.check("PASSWORD_RECOVERY",servlet.getRemoteAddr(),recoveryLimit);
        recovery.request(request.email(),trace.getTraceId(servlet));
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(new AccountResponses.Message(RECOVERY_MESSAGE));
    }
    @PostMapping(value="/reset-password",consumes=MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<AccountResponses.Message> reset(@Valid @RequestBody PasswordResetRequest request,HttpServletRequest servlet) {
        limits.check("PASSWORD_RESET",servlet.getRemoteAddr(),resetLimit);
        reset.reset(request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new AccountResponses.Message("Your password has been reset."));
    }
}
