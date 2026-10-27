package com.ayaantrix.collector.workspace.entity;
/** Section 18 launch allowances; no live prices or provider identifiers. */
public enum PlanKey {
    SOLO(1,100,25), AGENCY(5,300,100);
    public static final long STORAGE_BYTES=50_000_000_000L;
    private final int seats,aiDrafts,smsSegments;
    PlanKey(int seats,int aiDrafts,int smsSegments){this.seats=seats;this.aiDrafts=aiDrafts;this.smsSegments=smsSegments;}
    public int seats(){return seats;}
    public int aiDrafts(){return aiDrafts;}
    public int smsSegments(){return smsSegments;}
}
