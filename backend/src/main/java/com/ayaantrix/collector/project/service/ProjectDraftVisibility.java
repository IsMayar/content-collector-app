package com.ayaantrix.collector.project.service;
import tools.jackson.databind.JsonNode;
import java.util.*;
public final class ProjectDraftVisibility {private ProjectDraftVisibility(){}
 public static boolean visible(JsonNode section,JsonNode item,List<JsonNode> all,Map<UUID,JsonNode> drafts){if(!section.path("enabled").asBoolean()||!item.path("enabled").asBoolean())return false;if(!item.has("visibleWhen"))return true;var condition=item.get("visibleWhen");for(var s:all)for(var source:s.path("items"))if(source.path("key").asText().equals(condition.path("dependsOnItemKey").asText())&&source.path("type").asText().equals("SINGLE_SELECT")){var d=drafts.get(UUID.fromString(source.path("id").asText()));return visible(s,source,all,drafts)&&d!=null&&d.path("optionKey").asText().equals(condition.path("optionKey").asText());}return false;}
}
