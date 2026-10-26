package com.ayaantrix.collector.auth.repository;

import com.ayaantrix.collector.auth.entity.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select u from UserAccount u where u.id=:id")
    Optional<UserAccount> findLockedById(@org.springframework.data.repository.query.Param("id") UUID id);

    Optional<UserAccount> findByEmailNormalized(String emailNormalized);
    boolean existsByEmailNormalized(String emailNormalized);
}
