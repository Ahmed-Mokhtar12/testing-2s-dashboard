-- ROLLBACK for 20260731090000_schedule_training_report.sql.
select cron.unschedule('training-report-hourly');
