#import <EventKit/EventKit.h>
#import <Foundation/Foundation.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

static char *ASCopyCString(NSString *value) {
  if (value == nil) {
    value = @"";
  }
  const char *utf8 = [value UTF8String];
  if (utf8 == NULL) {
    utf8 = "";
  }
  char *copy = malloc(strlen(utf8) + 1);
  if (copy != NULL) {
    strcpy(copy, utf8);
  }
  return copy;
}

static char *ASCopyJSON(id object, char **errorOut) {
  NSError *error = nil;
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:&error];
  if (data == nil) {
    if (errorOut != NULL) {
      *errorOut = ASCopyCString([NSString stringWithFormat:@"adapter: failed to encode EventKit JSON: %@", error.localizedDescription]);
    }
    return NULL;
  }
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  return ASCopyCString(json);
}

static NSString *ASAuthorizationName(EKAuthorizationStatus status) {
  switch (status) {
    case EKAuthorizationStatusNotDetermined:
      return @"not_determined";
    case EKAuthorizationStatusRestricted:
      return @"restricted";
    case EKAuthorizationStatusDenied:
      return @"denied";
    default:
      if ((NSInteger)status == 3) {
        return @"full_access";
      }
      if ((NSInteger)status == 4) {
        return @"write_only";
      }
      return [NSString stringWithFormat:@"unknown_%ld", (long)status];
  }
}

static bool ASStatusAllowsAccess(EKAuthorizationStatus status) {
  return (NSInteger)status == 3;
}

static void ASSetPermissionError(EKEntityType entityType, EKAuthorizationStatus status, char **errorOut) {
  if (errorOut == NULL) {
    return;
  }
  NSString *name = entityType == EKEntityTypeEvent ? @"Calendar" : @"Reminders";
  NSString *statusName = ASAuthorizationName(status);
  NSString *extra = (NSInteger)status == 4
    ? @" Write-only access is not enough because Adaptive Surface needs read/list access."
    : @"";
  *errorOut = ASCopyCString([NSString stringWithFormat:@"permission: %@ access is not authorized for Adaptive Surface. statusRaw=%ld status=%@.%@", name, (long)status, statusName, extra]);
}

static bool ASRequestAccess(EKEntityType entityType, EKEventStore *store, char **errorOut) {
  __block BOOL granted = NO;
  __block NSError *requestError = nil;
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

  if (@available(macOS 14.0, *)) {
    if (entityType == EKEntityTypeEvent && [store respondsToSelector:@selector(requestFullAccessToEventsWithCompletion:)]) {
      [store requestFullAccessToEventsWithCompletion:^(BOOL didGrant, NSError *error) {
        granted = didGrant;
        requestError = error;
        dispatch_semaphore_signal(semaphore);
      }];
    } else if (entityType == EKEntityTypeReminder && [store respondsToSelector:@selector(requestFullAccessToRemindersWithCompletion:)]) {
      [store requestFullAccessToRemindersWithCompletion:^(BOOL didGrant, NSError *error) {
        granted = didGrant;
        requestError = error;
        dispatch_semaphore_signal(semaphore);
      }];
    } else {
      [store requestAccessToEntityType:entityType completion:^(BOOL didGrant, NSError *error) {
        granted = didGrant;
        requestError = error;
        dispatch_semaphore_signal(semaphore);
      }];
    }
  } else {
    [store requestAccessToEntityType:entityType completion:^(BOOL didGrant, NSError *error) {
      granted = didGrant;
      requestError = error;
      dispatch_semaphore_signal(semaphore);
    }];
  }

  dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC);
  if (dispatch_semaphore_wait(semaphore, timeout) != 0) {
    if (errorOut != NULL) {
      NSString *name = entityType == EKEntityTypeEvent ? @"Calendar" : @"Reminders";
      *errorOut = ASCopyCString([NSString stringWithFormat:@"timeout: %@ permission request timed out before macOS returned a decision.", name]);
    }
    return false;
  }

  if (requestError != nil) {
    if (errorOut != NULL) {
      NSString *name = entityType == EKEntityTypeEvent ? @"Calendar" : @"Reminders";
      *errorOut = ASCopyCString([NSString stringWithFormat:@"permission: %@ requestAccess failed before prompting or before a decision completed: %@", name, requestError.localizedDescription]);
    }
    return false;
  }

  if (!granted) {
    ASSetPermissionError(entityType, [EKEventStore authorizationStatusForEntityType:entityType], errorOut);
    return false;
  }

  return true;
}

static bool ASEnsureAccess(EKEntityType entityType, EKEventStore *store, char **errorOut) {
  EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:entityType];
  if (ASStatusAllowsAccess(status)) {
    return true;
  }

  if (status == EKAuthorizationStatusNotDetermined) {
    if (!ASRequestAccess(entityType, store, errorOut)) {
      return false;
    }
    status = [EKEventStore authorizationStatusForEntityType:entityType];
    if (ASStatusAllowsAccess(status)) {
      return true;
    }
  }

  ASSetPermissionError(entityType, status, errorOut);
  return false;
}

static NSString *ASISODate(NSDate *date) {
  if (date == nil) {
    return nil;
  }
  static NSISO8601DateFormatter *formatter = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    formatter = [[NSISO8601DateFormatter alloc] init];
  });
  return [formatter stringFromDate:date];
}

char *adaptive_calendar_events_json(unsigned int daysAhead, unsigned long limit, char **errorOut) {
  @autoreleasepool {
    EKEventStore *store = [[EKEventStore alloc] init];
    if (!ASEnsureAccess(EKEntityTypeEvent, store, errorOut)) {
      return NULL;
    }

    NSCalendar *calendar = [NSCalendar currentCalendar];
    NSDate *start = [calendar startOfDayForDate:[NSDate date]];
    NSDate *end = [calendar dateByAddingUnit:NSCalendarUnitDay value:daysAhead toDate:start options:0];
    NSPredicate *predicate = [store predicateForEventsWithStartDate:start endDate:end calendars:nil];
    NSArray<EKEvent *> *events = [[store eventsMatchingPredicate:predicate] sortedArrayUsingComparator:^NSComparisonResult(EKEvent *left, EKEvent *right) {
      return [left.startDate compare:right.startDate];
    }];

    NSMutableArray *rows = [NSMutableArray array];
    NSUInteger maxRows = (NSUInteger)limit;
    for (EKEvent *event in events) {
      if (rows.count >= maxRows) {
        break;
      }
      [rows addObject:@{
        @"id": event.eventIdentifier ?: [[NSUUID UUID] UUIDString],
        @"title": event.title ?: @"(No title)",
        @"calendarName": event.calendar.title ?: @"Calendar",
        @"startAt": ASISODate(event.startDate) ?: @"",
        @"endAt": ASISODate(event.endDate) ?: [NSNull null],
        @"location": event.location ?: [NSNull null],
        @"notes": event.notes ?: [NSNull null]
      }];
    }

    return ASCopyJSON(rows, errorOut);
  }
}

char *adaptive_reminders_json(bool includeCompleted, unsigned long limit, char **errorOut) {
  @autoreleasepool {
    EKEventStore *store = [[EKEventStore alloc] init];
    if (!ASEnsureAccess(EKEntityTypeReminder, store, errorOut)) {
      return NULL;
    }

    NSPredicate *predicate = [store predicateForRemindersInCalendars:nil];
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    __block NSArray<EKReminder *> *loaded = @[];
    [store fetchRemindersMatchingPredicate:predicate completion:^(NSArray<EKReminder *> *reminders) {
      loaded = reminders ?: @[];
      dispatch_semaphore_signal(semaphore);
    }];

    dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 10 * NSEC_PER_SEC);
    if (dispatch_semaphore_wait(semaphore, timeout) != 0) {
      if (errorOut != NULL) {
        *errorOut = ASCopyCString(@"timeout: Reminders fetch timed out.");
      }
      return NULL;
    }

    NSMutableArray *rows = [NSMutableArray array];
    NSUInteger maxRows = (NSUInteger)limit;
    NSCalendar *calendar = [NSCalendar currentCalendar];
    for (EKReminder *reminder in loaded) {
      if (rows.count >= maxRows) {
        break;
      }
      if (!includeCompleted && reminder.completed) {
        continue;
      }
      NSDate *due = reminder.dueDateComponents == nil ? nil : [calendar dateFromComponents:reminder.dueDateComponents];
      [rows addObject:@{
        @"id": reminder.calendarItemIdentifier ?: [[NSUUID UUID] UUIDString],
        @"title": reminder.title ?: @"(No title)",
        @"listName": reminder.calendar.title ?: @"Reminders",
        @"dueAt": ASISODate(due) ?: [NSNull null],
        @"completed": @(reminder.completed),
        @"notes": reminder.notes ?: [NSNull null]
      }];
    }

    return ASCopyJSON(rows, errorOut);
  }
}

char *adaptive_eventkit_status_json(bool reminders, char **errorOut) {
  @autoreleasepool {
    EKEntityType entityType = reminders ? EKEntityTypeReminder : EKEntityTypeEvent;
    EKAuthorizationStatus status = [EKEventStore authorizationStatusForEntityType:entityType];
    NSDictionary *result = @{
      @"statusRaw": @((NSInteger)status),
      @"status": ASAuthorizationName(status),
      @"authorized": @(ASStatusAllowsAccess(status))
    };
    return ASCopyJSON(result, errorOut);
  }
}

void adaptive_eventkit_free(char *value) {
  if (value != NULL) {
    free(value);
  }
}
