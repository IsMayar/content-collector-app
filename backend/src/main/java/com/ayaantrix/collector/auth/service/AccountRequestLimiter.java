package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.common.error.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.sql.Timestamp;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.util.HexFormat;

@Component
public class AccountRequestLimiter {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public AccountRequestLimiter(JdbcTemplate jdbc, Clock clock) { this.jdbc=jdbc; this.clock=clock; }
    @Transactional(propagation=Propagation.REQUIRES_NEW)
    public void check(String operation, String address, int limit) {
        Instant now=clock.instant();
        Instant window=now.truncatedTo(java.time.temporal.ChronoUnit.MINUTES);
        // Bound retained limiter metadata to one day; no raw IP is persisted.
        jdbc.update("delete from collector.account_request_limits where window_start < ?",Timestamp.from(now.minusSeconds(86400)));
        Integer count=jdbc.queryForObject("""
                insert into collector.account_request_limits(operation,key_hash,window_start,request_count)
                values (?,?,?,1) on conflict(operation,key_hash) do update set
                request_count=case when account_request_limits.window_start < excluded.window_start then 1
                    else least(account_request_limits.request_count+1,1000000) end,
                window_start=greatest(account_request_limits.window_start,excluded.window_start)
                returning request_count
                """,Integer.class,operation,hash(operation+":"+address),Timestamp.from(window));
        if (count != null && count > limit)
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,"RATE_LIMITED","Too many attempts. Please wait before trying again.");
    }
    private String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException("SHA-256 is unavailable."); }
    }
}
