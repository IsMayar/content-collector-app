package com.ayaantrix.collector.auth.repository;

import com.ayaantrix.collector.auth.entity.AccountToken;
import com.ayaantrix.collector.auth.entity.TokenPurpose;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountTokenRepository extends JpaRepository<AccountToken, UUID> {
    Optional<AccountToken> findByTokenHashAndPurpose(String tokenHash, TokenPurpose purpose);
    List<AccountToken> findByUserIdAndPurpose(UUID userId, TokenPurpose purpose);

    // A return value of 1 is the only successful consumption. Call within the future
    // verification/reset transaction so account changes and consumption commit together.
    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update AccountToken t set t.consumedAt = :now, t.updatedAt = :now
            where t.id = :id and t.purpose = :purpose
            and t.createdAt <= :now and t.expiresAt > :now
            and t.consumedAt is null and t.revokedAt is null
            """)
    int consume(@Param("id") UUID id, @Param("purpose") TokenPurpose purpose, @Param("now") Instant now);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update AccountToken t set t.revokedAt = :now, t.updatedAt = :now
            where t.id = :id and t.purpose = :purpose and t.createdAt <= :now
            and t.consumedAt is null and t.revokedAt is null
            """)
    int revoke(@Param("id") UUID id, @Param("purpose") TokenPurpose purpose, @Param("now") Instant now);

    @Transactional
    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update AccountToken t set t.revokedAt = :now, t.updatedAt = :now
            where t.userId = :userId and t.purpose = :purpose and t.createdAt <= :now
            and t.consumedAt is null and t.revokedAt is null
            """)
    int revokeUnconsumedForUserAndPurpose(@Param("userId") UUID userId,
            @Param("purpose") TokenPurpose purpose, @Param("now") Instant now);
}
