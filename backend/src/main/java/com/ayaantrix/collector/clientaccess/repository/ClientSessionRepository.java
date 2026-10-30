package com.ayaantrix.collector.clientaccess.repository;
import com.ayaantrix.collector.clientaccess.entity.ClientSession;
import org.springframework.data.repository.Repository;
import org.springframework.data.jpa.repository.*;
import java.util.*;
import java.time.Instant;
public interface ClientSessionRepository extends Repository<ClientSession,UUID>{
 ClientSession saveAndFlush(ClientSession session);
 Optional<ClientSession> findByTokenHash(String tokenHash);
 @Modifying @Query("update ClientSession s set s.revokedAt=:now where s.tokenHash=:hash and s.revokedAt is null") int revokeToken(String hash,Instant now);
 @Modifying @Query("update ClientSession s set s.revokedAt=:now where s.workspaceId=:workspace and s.projectId=:project and s.contactId=:contact and s.revokedAt is null") int revokeGrant(UUID workspace,UUID project,UUID contact,Instant now);
}
