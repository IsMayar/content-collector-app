package com.ayaantrix.collector.billing.controller;

import com.ayaantrix.collector.billing.dto.BillingDtos.Checkout;
import com.ayaantrix.collector.billing.security.StripeWebhook;
import com.ayaantrix.collector.billing.service.BillingService;

import jakarta.validation.Valid;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping(value = "/api/v1", produces = MediaType.APPLICATION_JSON_VALUE)
public class BillingController {
    private final BillingService billing;
    private final StripeWebhook webhook;

    public BillingController(BillingService billing, StripeWebhook webhook) {
        this.billing = billing;
        this.webhook = webhook;
    }

    @GetMapping("/workspaces/{workspace}/subscription")
    ResponseEntity<Map<String, Object>> read(@PathVariable UUID workspace) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(billing.read(workspace));
    }

    @PostMapping(
            value = "/workspaces/{workspace}/billing/checkout",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String, String>> checkout(
            @PathVariable UUID workspace,
            @RequestHeader("Idempotency-Key") String key,
            @Valid @RequestBody Checkout request) {
        return hosted(billing.hosted(workspace, request.planKey(), key));
    }

    @GetMapping("/workspaces/{workspace}/usage")
    ResponseEntity<Map<String, Object>> usage(@PathVariable UUID workspace) {
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("usage", billing.usage(workspace)));
    }

    @PostMapping(
            value = "/workspaces/{workspace}/billing/portal",
            consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String, String>> portal(
            @PathVariable UUID workspace, @RequestHeader("Idempotency-Key") String key) {
        return hosted(billing.hosted(workspace, null, key));
    }

    @PostMapping(value = "/webhooks/stripe", consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<Map<String, Boolean>> stripe(
            @RequestBody byte[] body,
            @RequestHeader(value = "Stripe-Signature", required = false) String signature) {
        webhook.receive(body, signature);
        return ResponseEntity.ok()
                .cacheControl(CacheControl.noStore())
                .body(Map.of("accepted", true));
    }

    private ResponseEntity<Map<String, String>> hosted(String url) {
        return ResponseEntity.status(201)
                .cacheControl(CacheControl.noStore())
                .body(Map.of("url", url));
    }
}
