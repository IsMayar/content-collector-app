package com.ayaantrix.collector.sms.service;

import com.google.i18n.phonenumbers.PhoneNumberUtil;

import java.time.*;

public final class SmsRules {
    private SmsRules() {}

    public static String usPhone(String raw) {
        try {
            var util = PhoneNumberUtil.getInstance();
            var n = util.parse(raw, "US");
            if (!util.isValidNumberForRegion(n, "US")
                    || !raw.equals(util.format(n, PhoneNumberUtil.PhoneNumberFormat.E164)))
                throw new IllegalArgumentException();
            return raw;
        } catch (Exception e) {
            throw new IllegalArgumentException("A valid US E.164 number is required.");
        }
    }

    public static boolean quiet(Instant time, String timezone) {
        var t = time.atZone(ZoneId.of(timezone));
        return t.getDayOfWeek().getValue() > 5 || t.getHour() < 9 || t.getHour() >= 20;
    }

    public static Instant nextAllowed(Instant time, String timezone) {
        var z = ZoneId.of(timezone);
        var t = time.atZone(z);
        if (!quiet(time, timezone)) return time;
        var day = t.toLocalDate();
        if (t.getHour() >= 20) day = day.plusDays(1);
        while (day.getDayOfWeek().getValue() > 5) day = day.plusDays(1);
        return day.atTime(9, 0).atZone(z).toInstant();
    }

    public static int segments(String text) {
        String basic =
                "@£$¥èéùìòÇ\n"
                    + "Øø\r"
                    + "ÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ"
                    + " !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
        String extended = "^{}\\[~]|€\f";
        int units = 0;
        boolean gsm = true;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (basic.indexOf(c) >= 0) units++;
            else if (extended.indexOf(c) >= 0) units += 2;
            else {
                gsm = false;
                break;
            }
        }
        if (!gsm) {
            units = text.length();
            return units <= 70 ? 1 : (units + 66) / 67;
        }
        return units <= 160 ? 1 : (units + 152) / 153;
    }
}
