#import <Contacts/Contacts.h>
#import <Foundation/Foundation.h>
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
      *errorOut = ASCopyCString([NSString stringWithFormat:@"adapter: failed to encode Contacts JSON: %@", error.localizedDescription]);
    }
    return NULL;
  }
  NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  return ASCopyCString(json);
}

static NSString *ASContactsAuthorizationName(CNAuthorizationStatus status) {
  switch (status) {
    case CNAuthorizationStatusNotDetermined:
      return @"not_determined";
    case CNAuthorizationStatusRestricted:
      return @"restricted";
    case CNAuthorizationStatusDenied:
      return @"denied";
    case CNAuthorizationStatusAuthorized:
      return @"authorized";
    default:
      return [NSString stringWithFormat:@"unknown_%ld", (long)status];
  }
}

static bool ASContactsAllowsAccess(CNAuthorizationStatus status) {
  return status == CNAuthorizationStatusAuthorized;
}

static NSDictionary *ASContactsStatusDictionary(void) {
  CNAuthorizationStatus status = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
  return @{
    @"statusRaw": @((NSInteger)status),
    @"status": ASContactsAuthorizationName(status),
    @"authorized": @(ASContactsAllowsAccess(status))
  };
}

static void ASSetContactsPermissionError(CNAuthorizationStatus status, char **errorOut) {
  if (errorOut == NULL) {
    return;
  }
  *errorOut = ASCopyCString([NSString stringWithFormat:@"permission: Contacts access is not authorized for Adaptive Surface. statusRaw=%ld status=%@", (long)status, ASContactsAuthorizationName(status)]);
}

static bool ASEnsureContactsAccess(CNContactStore *store, char **errorOut) {
  CNAuthorizationStatus status = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
  if (ASContactsAllowsAccess(status)) {
    return true;
  }

  if (status == CNAuthorizationStatusNotDetermined) {
    __block BOOL granted = NO;
    __block NSError *requestError = nil;
    dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
    [store requestAccessForEntityType:CNEntityTypeContacts completionHandler:^(BOOL didGrant, NSError *error) {
      granted = didGrant;
      requestError = error;
      dispatch_semaphore_signal(semaphore);
    }];

    dispatch_time_t timeout = dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC);
    if (dispatch_semaphore_wait(semaphore, timeout) != 0) {
      if (errorOut != NULL) {
        *errorOut = ASCopyCString(@"timeout: Contacts permission request timed out before macOS returned a decision.");
      }
      return false;
    }

    if (requestError != nil) {
      if (errorOut != NULL) {
        *errorOut = ASCopyCString([NSString stringWithFormat:@"permission: Contacts requestAccess failed before prompting or before a decision completed: %@", requestError.localizedDescription]);
      }
      return false;
    }

    if (!granted) {
      ASSetContactsPermissionError([CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts], errorOut);
      return false;
    }

    status = [CNContactStore authorizationStatusForEntityType:CNEntityTypeContacts];
    if (ASContactsAllowsAccess(status)) {
      return true;
    }
  }

  ASSetContactsPermissionError(status, errorOut);
  return false;
}

char *adaptive_contacts_status_json(char **errorOut) {
  @autoreleasepool {
    return ASCopyJSON(ASContactsStatusDictionary(), errorOut);
  }
}

char *adaptive_contacts_request_access_json(char **errorOut) {
  @autoreleasepool {
    CNContactStore *store = [[CNContactStore alloc] init];
    if (!ASEnsureContactsAccess(store, errorOut)) {
      return NULL;
    }
    return ASCopyJSON(ASContactsStatusDictionary(), errorOut);
  }
}

char *adaptive_contacts_search_json(const char *query, unsigned long limit, char **errorOut) {
  @autoreleasepool {
    CNContactStore *store = [[CNContactStore alloc] init];
    if (!ASEnsureContactsAccess(store, errorOut)) {
      return NULL;
    }

    NSString *needle = query == NULL ? @"" : [NSString stringWithUTF8String:query];
    needle = [needle lowercaseString];
    NSArray *keys = @[
      CNContactIdentifierKey,
      CNContactGivenNameKey,
      CNContactFamilyNameKey,
      CNContactOrganizationNameKey,
      CNContactEmailAddressesKey,
      CNContactPhoneNumbersKey
    ];
    CNContactFetchRequest *request = [[CNContactFetchRequest alloc] initWithKeysToFetch:keys];
    NSMutableArray *rows = [NSMutableArray array];
    NSError *error = nil;
    BOOL ok = [store enumerateContactsWithFetchRequest:request error:&error usingBlock:^(CNContact *contact, BOOL *stop) {
      NSString *displayName = [[@[contact.givenName ?: @"", contact.familyName ?: @""] filteredArrayUsingPredicate:[NSPredicate predicateWithBlock:^BOOL(NSString *value, NSDictionary *bindings) {
        (void)bindings;
        return value.length > 0;
      }]] componentsJoinedByString:@" "];
      NSMutableArray *emails = [NSMutableArray array];
      for (CNLabeledValue<NSString *> *email in contact.emailAddresses) {
        [emails addObject:(NSString *)email.value];
      }
      NSMutableArray *phones = [NSMutableArray array];
      for (CNLabeledValue<CNPhoneNumber *> *phone in contact.phoneNumbers) {
        [phones addObject:phone.value.stringValue ?: @""];
      }
      NSString *haystack = [[@[displayName ?: @"", contact.organizationName ?: @"", [emails componentsJoinedByString:@" "], [phones componentsJoinedByString:@" "]] componentsJoinedByString:@" "] lowercaseString];
      if (needle.length == 0 || [haystack containsString:needle]) {
        [rows addObject:@{
          @"id": contact.identifier ?: [[NSUUID UUID] UUIDString],
          @"displayName": displayName.length > 0 ? displayName : (contact.organizationName.length > 0 ? contact.organizationName : @"(No name)"),
          @"emails": emails,
          @"phoneNumbers": phones,
          @"organization": contact.organizationName.length > 0 ? contact.organizationName : [NSNull null]
        }];
        if (rows.count >= (NSUInteger)limit) {
          *stop = YES;
        }
      }
    }];

    if (!ok) {
      if (errorOut != NULL) {
        *errorOut = ASCopyCString([NSString stringWithFormat:@"adapter: Contacts search failed: %@", error.localizedDescription]);
      }
      return NULL;
    }

    return ASCopyJSON(rows, errorOut);
  }
}

void adaptive_contacts_free(char *value) {
  if (value != NULL) {
    free(value);
  }
}
