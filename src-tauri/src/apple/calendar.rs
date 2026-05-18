use super::models::{AppleCalendarEvent, AppleCommandResult, CalendarQuery, CreateCalendarEventRequest};
use crate::providers::calendar_provider;

pub fn load_calendar_events(query: CalendarQuery) -> Result<Vec<AppleCalendarEvent>, String> {
    calendar_provider::list(query).map_err(|error| error.message())
}

pub fn create_calendar_event(request: CreateCalendarEventRequest) -> Result<AppleCommandResult, String> {
    calendar_provider::create(request).map_err(|error| error.message())
}
