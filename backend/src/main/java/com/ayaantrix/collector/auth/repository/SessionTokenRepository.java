package com.ayaantrix.collector.auth.repository;
import com.ayaantrix.collector.auth.entity.SessionToken;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.util.*;
public interface SessionTokenRepository extends JpaRepository<SessionToken,UUID> {
    interface Location {UUID getId();UUID getSessionId();UUID getUserId();}
    @Query(value="select t.id,t.session_id as sessionId,s.user_id as userId from collector.session_tokens t join collector.auth_sessions s on s.id=t.session_id where t.token_hash=:hash",nativeQuery=true)
    Optional<Location> locate(@Param("hash") String hash);
}
