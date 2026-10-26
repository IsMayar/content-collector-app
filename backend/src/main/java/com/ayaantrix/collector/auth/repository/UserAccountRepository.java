package com.ayaantrix.collector.auth.repository;

import com.ayaantrix.collector.auth.entity.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;
import java.util.UUID;

public interface UserAccountRepository extends JpaRepository<UserAccount, UUID> {
    Optional<UserAccount> findByEmailNormalized(String emailNormalized);
    boolean existsByEmailNormalized(String emailNormalized);
}
