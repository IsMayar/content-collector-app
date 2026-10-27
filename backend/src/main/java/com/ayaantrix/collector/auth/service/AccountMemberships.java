package com.ayaantrix.collector.auth.service;

import com.ayaantrix.collector.auth.dto.SessionResponses;
import java.util.List;
import java.util.UUID;

/** Internal projection port. Caller must first validate the authenticated account/session. */
public interface AccountMemberships {
    List<SessionResponses.Membership> forAuthenticatedUser(UUID userId);
}
