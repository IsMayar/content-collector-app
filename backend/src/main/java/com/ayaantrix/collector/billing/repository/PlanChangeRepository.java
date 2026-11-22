package com.ayaantrix.collector.billing.repository;

import com.ayaantrix.collector.workspace.entity.PlanKey;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.*;
import java.time.*;
import java.util.*;
import static com.ayaantrix.collector.billing.repository.BillingRepository.time;

@Repository
@Transactional(propagation=Propagation.MANDATORY)
public class PlanChangeRepository {
    public record Change(UUID id,UUID actor,String key,PlanKey target,String subscription,UUID checkout,Instant effectiveAt,String state,String schedule,Instant lease,Instant createdAt) {}
    private final JdbcTemplate jdbc;
    public PlanChangeRepository(JdbcTemplate jdbc){this.jdbc=jdbc;}
    private List<Change> rows(UUID w,String predicate,Object... args){
        var values=new ArrayList<Object>();values.add(w);values.addAll(Arrays.asList(args));
        return jdbc.query("select * from collector.billing_plan_changes where workspace_id=? and "+predicate+" for update",(r,n)->new Change(r.getObject("id",UUID.class),r.getObject("actor_id",UUID.class),r.getString("idempotency_key"),PlanKey.valueOf(r.getString("target_plan")),r.getString("subscription_id"),r.getObject("source_checkout",UUID.class),r.getTimestamp("effective_at").toInstant(),r.getString("state"),r.getString("provider_schedule_id"),r.getTimestamp("lease_until").toInstant(),r.getTimestamp("created_at").toInstant()),values.toArray());
    }
    public Optional<Change> replay(UUID w,UUID actor,String key){return rows(w,"actor_id=? and idempotency_key=?",actor,key).stream().findFirst();}
    public Optional<Change> pending(UUID w){return rows(w,"state in ('REQUESTED','SCHEDULED')").stream().findFirst();}
    public void create(UUID w,Change c,Instant now){jdbc.update("insert into collector.billing_plan_changes(id,workspace_id,actor_id,idempotency_key,target_plan,subscription_id,source_checkout,effective_at,state,lease_until,created_at,updated_at) values(?,?,?,?,?,?,?,?,'REQUESTED',?,?,?)",c.id(),w,c.actor(),c.key(),c.target().name(),c.subscription(),c.checkout(),time(c.effectiveAt()),time(now.plusSeconds(90)),time(now),time(now));}
    public void lease(UUID w,UUID id,Instant now){jdbc.update("update collector.billing_plan_changes set lease_until=?,updated_at=? where workspace_id=? and id=?",time(now.plusSeconds(90)),time(now),w,id);}
    public boolean scheduled(UUID w,UUID id,String schedule,Instant now){return jdbc.update("update collector.billing_plan_changes set state='SCHEDULED',provider_schedule_id=?,lease_until=?,updated_at=? where workspace_id=? and id=? and state='REQUESTED'",schedule,time(now),time(now),w,id)==1;}
    public void release(UUID w,UUID id,Instant now){jdbc.update("update collector.billing_plan_changes set lease_until=? where workspace_id=? and id=? and state='REQUESTED'",time(now),w,id);}
    public boolean matches(UUID w,UUID id,String subscription,PlanKey plan,Instant start){return !rows(w,"id=? and subscription_id=? and target_plan=? and effective_at<=?",id,subscription,plan.name(),time(start)).isEmpty();}
    public void applied(UUID w,UUID id,Instant now){jdbc.update("update collector.billing_plan_changes set state='APPLIED',updated_at=? where workspace_id=? and id=?",time(now),w,id);}
    public void cancelled(UUID w,String subscription,Instant now){jdbc.update("update collector.billing_plan_changes set state='CANCELLED',updated_at=? where workspace_id=? and subscription_id=? and state in ('REQUESTED','SCHEDULED')",time(now),w,subscription);}
}
