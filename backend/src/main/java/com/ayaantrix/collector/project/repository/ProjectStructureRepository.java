package com.ayaantrix.collector.project.repository;
import com.ayaantrix.collector.project.entity.Project;
import com.ayaantrix.collector.project.dto.ProjectDtos.Progress;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import tools.jackson.databind.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.*;
import java.sql.ResultSet;
import java.time.Instant;
import java.util.*;
@Repository
public class ProjectStructureRepository {
    private final JdbcTemplate jdbc;private final JsonMapper json;
    ProjectStructureRepository(JdbcTemplate jdbc,JsonMapper json){this.jdbc=jdbc;this.json=json;}
    public void copy(Project project,JsonNode definition,Instant now){
        var timestamp=java.sql.Timestamp.from(now);
        int sectionOrder=0;
        for(var section:definition.get("sections")){
            UUID sid=UUID.randomUUID();jdbc.update("""
                insert into collector.sections(id,workspace_id,project_id,section_key,title,sort_order,created_at,updated_at)
                values (?,?,?,?,?,?,?,?)
                """,sid,project.workspaceId(),project.id(),section.get("key").asText(),section.get("title").asText(),sectionOrder++,timestamp,timestamp);
            int itemOrder=0;
            for(var item:section.get("items"))jdbc.update("""
                insert into collector.items(id,workspace_id,project_id,section_id,item_key,label,field_type,instructions,example_answer,
                    required,enabled,sort_order,schema_json,created_at,updated_at)
                values (?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?)
                """,UUID.randomUUID(),project.workspaceId(),project.id(),sid,item.get("key").asText(),item.get("label").asText(),item.get("type").asText(),
                item.get("instructions").asText(),item.get("example").asText(),item.get("required").asBoolean(),item.path("enabled").asBoolean(true),itemOrder++,item.toString(),timestamp,timestamp);
        }
    }
    public List<JsonNode> structure(UUID workspace,UUID project){
        var sections=new LinkedHashMap<UUID,ObjectNode>();
        jdbc.query("select id,section_key,title,enabled,sort_order from collector.sections where workspace_id=? and project_id=? order by sort_order,id",(org.springframework.jdbc.core.RowCallbackHandler)rs->{
            UUID id=rs.getObject("id",UUID.class);var s=json.createObjectNode();s.put("id",id.toString()).put("key",rs.getString("section_key"))
                .put("title",rs.getString("title")).put("enabled",rs.getBoolean("enabled")).put("sortOrder",rs.getInt("sort_order"));s.putArray("items");sections.put(id,s);
        },workspace,project);
        jdbc.query("select * from collector.items where workspace_id=? and project_id=? order by section_id,sort_order,id",(org.springframework.jdbc.core.RowCallbackHandler)rs->{
            var node=(ObjectNode)json.readTree(rs.getString("schema_json"));node.put("id",rs.getObject("id",UUID.class).toString())
                .put("sectionId",rs.getObject("section_id",UUID.class).toString()).put("sortOrder",rs.getInt("sort_order"))
                .put("enabled",rs.getBoolean("enabled")).put("state",rs.getString("state")).put("version",rs.getLong("version"))
                .put("visible",sections.get(rs.getObject("section_id",UUID.class)).get("enabled").asBoolean() && rs.getBoolean("enabled") && !node.has("visibleWhen"));
            UUID revision=rs.getObject("current_revision_id",UUID.class);if(revision==null)node.putNull("currentRevisionId");else node.put("currentRevisionId",revision.toString());
            ((ArrayNode)sections.get(rs.getObject("section_id",UUID.class)).get("items")).add(node);
        },workspace,project);
        return new ArrayList<>(sections.values());
    }
    public static ObjectNode definition(JsonNode item){
        var result=(ObjectNode)item.deepCopy();
        for(String key:List.of("id","sectionId","sortOrder","state","version","currentRevisionId","visible"))result.remove(key);
        return result;
    }
    /** Apply only changed rows. Called under the scoped project lock, within the service transaction. */
    public void apply(Project project,List<JsonNode> before,List<JsonNode> after,Instant now){
        var oldSections=new HashMap<String,JsonNode>();var oldItems=new HashMap<String,JsonNode>();
        for(var section:before){oldSections.put(section.get("id").asText(),section);for(var item:section.get("items"))oldItems.put(item.get("id").asText(),item);}
        var time=java.sql.Timestamp.from(now);
        for(var section:after){
            UUID sid=UUID.fromString(section.get("id").asText());var old=oldSections.get(sid.toString());
            if(old==null)jdbc.update("insert into collector.sections(id,workspace_id,project_id,section_key,title,sort_order,enabled,created_at,updated_at) values(?,?,?,?,?,?,?,?,?)",
                sid,project.workspaceId(),project.id(),section.get("key").asText(),section.get("title").asText(),section.get("sortOrder").asInt(),section.get("enabled").asBoolean(),time,time);
            else if(!old.get("title").equals(section.get("title")) || !old.get("enabled").equals(section.get("enabled")) || !old.get("sortOrder").equals(section.get("sortOrder")))
                jdbc.update("update collector.sections set title=?,enabled=?,sort_order=?,updated_at=? where workspace_id=? and project_id=? and id=?",
                    section.get("title").asText(),section.get("enabled").asBoolean(),section.get("sortOrder").asInt(),time,project.workspaceId(),project.id(),sid);
            for(var item:section.get("items")){
                UUID iid=UUID.fromString(item.get("id").asText());var previous=oldItems.get(iid.toString());
                var definition=definition(item);
                if(previous==null)jdbc.update("""
                    insert into collector.items(id,workspace_id,project_id,section_id,item_key,label,field_type,instructions,example_answer,required,enabled,sort_order,schema_json,created_at,updated_at)
                    values(?,?,?,?,?,?,?,?,?,?,?,?,?::jsonb,?,?)
                    """,iid,project.workspaceId(),project.id(),sid,definition.get("key").asText(),definition.get("label").asText(),definition.get("type").asText(),definition.get("instructions").asText(),definition.get("example").asText(),definition.get("required").asBoolean(),definition.path("enabled").asBoolean(true),item.get("sortOrder").asInt(),definition.toString(),time,time);
                else if(!definition(previous).equals(definition))
                    jdbc.update("""
                        update collector.items set label=?,field_type=?,instructions=?,example_answer=?,required=?,enabled=?,schema_json=?::jsonb,version=version+1,sort_order=?,updated_at=?
                        where workspace_id=? and project_id=? and section_id=? and id=?
                        """,definition.get("label").asText(),definition.get("type").asText(),definition.get("instructions").asText(),definition.get("example").asText(),definition.get("required").asBoolean(),definition.path("enabled").asBoolean(true),definition.toString(),item.get("sortOrder").asInt(),time,project.workspaceId(),project.id(),sid,iid);
                else if(!previous.get("sortOrder").equals(item.get("sortOrder")))jdbc.update("update collector.items set sort_order=?,updated_at=? where workspace_id=? and project_id=? and section_id=? and id=?",
                    item.get("sortOrder").asInt(),time,project.workspaceId(),project.id(),sid,iid);
            }
        }
    }
    public void audit(Project project,UUID actor,String action,String kind,UUID resource,Instant now){
        var time=java.sql.Timestamp.from(now);
        var metadata=json.createObjectNode().put("structureVersion",project.structureVersion());
        jdbc.update("""
            insert into collector.audit_logs(id,workspace_id,project_id,actor_kind,actor_id,action,resource_kind,resource_id,metadata_json,created_at,updated_at)
            values(?,?,?,'USER',?,?,?,?,?::jsonb,?,?)
            """,UUID.randomUUID(),project.workspaceId(),project.id(),actor,action,kind,resource,metadata.toString(),time,time);
    }
    public Map<UUID,Progress> progress(UUID workspace,List<UUID> projects){
        if(projects.isEmpty())return Map.of();var result=new HashMap<UUID,Progress>();
        // Fresh projects have no answers: every conditional item is hidden until its predecessor is answered in T15.
        String placeholders=String.join(",",Collections.nCopies(projects.size(),"?"));var args=new ArrayList<Object>();args.add(workspace);args.addAll(projects);
        jdbc.query("""
            select i.project_id,count(*) filter(where i.required) required_total,
                count(*) filter(where i.required and i.state in ('SUBMITTED','APPROVED')) submitted,
                count(*) filter(where i.required and i.state='APPROVED') approved,
                count(*) filter(where i.required and i.state not in ('SUBMITTED','APPROVED')) actionable,
                count(*) filter(where not i.required and i.state='APPROVED') optional_approved
            from collector.items i join collector.sections s on s.workspace_id=i.workspace_id and s.project_id=i.project_id and s.id=i.section_id
            where i.workspace_id=? and i.project_id in (
            """+placeholders+") and i.enabled and s.enabled and not (i.schema_json ?? 'visibleWhen') group by i.project_id",
            (org.springframework.jdbc.core.RowCallbackHandler)rs->result.put(rs.getObject("project_id",UUID.class),new Progress(rs.getLong("required_total"),rs.getLong("submitted"),rs.getLong("approved"),rs.getLong("actionable"),rs.getLong("optional_approved"))),args.toArray());
        return result;
    }
}
