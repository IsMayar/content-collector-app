package com.ayaantrix.collector.workspace.entity;
/** Approved commercial policy, 19 November 2026. Provider availability is independent. */
public enum PlanKey {
    FREE(0,2,1,5,500_000_000L,0,0,ReminderTier.NONE,AnalyticsTier.BASIC),
    SOLO(700,10,1,50,5_000_000_000L,50,0,ReminderTier.BASIC,AnalyticsTier.PROJECT),
    AGENCY(1900,null,5,null,25_000_000_000L,200,50,ReminderTier.ADVANCED,AnalyticsTier.WORKSPACE);
    public enum ReminderTier { NONE, BASIC, ADVANCED }
    public enum AnalyticsTier { BASIC, PROJECT, WORKSPACE }
    /** Operator ceiling, separate from commercial storage limits. */
    public static final long STORAGE_BYTES=50_000_000_000L;
    private final int monthlyCents,seats,aiDrafts,smsSegments;
    private final Integer activeProjects,contacts;
    private final long storageBytes;
    private final ReminderTier reminders;
    private final AnalyticsTier analytics;
    PlanKey(int monthlyCents,Integer activeProjects,int seats,Integer contacts,long storageBytes,int aiDrafts,int smsSegments,ReminderTier reminders,AnalyticsTier analytics){this.monthlyCents=monthlyCents;this.activeProjects=activeProjects;this.seats=seats;this.contacts=contacts;this.storageBytes=storageBytes;this.aiDrafts=aiDrafts;this.smsSegments=smsSegments;this.reminders=reminders;this.analytics=analytics;}
    public int monthlyCents(){return monthlyCents;}
    public Integer activeProjects(){return activeProjects;}
    public Integer contacts(){return contacts;}
    public long storageBytes(){return storageBytes;}
    public ReminderTier reminders(){return reminders;}
    public AnalyticsTier analytics(){return analytics;}
    public boolean customTemplates(){return this!=FREE;}
    public boolean sharedTemplates(){return this==AGENCY;}
    public boolean teamAssignments(){return this==AGENCY;}
    public boolean delegatedReview(){return this==AGENCY;}
    public boolean zipExport(){return this!=FREE;}
    public boolean branding(){return this!=FREE;}
    public int seats(){return seats;}
    public int aiDrafts(){return aiDrafts;}
    public int smsSegments(){return smsSegments;}
}
