package com.ayaantrix.collector.visibility.security;

import jakarta.servlet.http.*;

import org.springframework.security.web.header.HeaderWriter;

public class ShareFrameHeaders implements HeaderWriter {
    public static final String APPROVED_EMBED = "collector.approvedStatusEmbed";

    @Override
    public void writeHeaders(HttpServletRequest request, HttpServletResponse response) {
        if (!Boolean.TRUE.equals(request.getAttribute(APPROVED_EMBED))) {
            response.setHeader("X-Frame-Options", "DENY");
            response.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
        }
    }
}
