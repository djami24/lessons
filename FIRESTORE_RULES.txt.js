rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isAdmin() {
      return isSignedIn() &&
        exists(/databases/$(database)/documents/admins/$(request.auth.uid));
    }

    // Admin accounts
    match /admins/{adminId} {
      allow read: if isSignedIn() && request.auth.uid == adminId;
      allow write: if false; 
    }

    // Site settings
    match /settings/{docId} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // Course structure (Lessons)
    match /levels/{levelId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    // Writing Tasks (Questions added by admin)
    match /writing_tasks/{taskId} {
      allow read: if isSignedIn();
      allow write: if isAdmin();
    }

    // Writing Submissions (Student essays and grading)
    match /writing_submissions/{submissionId} {
      allow read: if isSignedIn() && (isAdmin() || resource.data.studentUid == request.auth.uid);
      allow create: if isSignedIn() && request.resource.data.studentUid == request.auth.uid;
      allow update: if isSignedIn() && (isAdmin() || (resource.data.studentUid == request.auth.uid && request.resource.data.studentUid == request.auth.uid));
      allow delete: if isAdmin();
    }

    // Student accounts
    match /students/{studentId} {
      allow read: if isAdmin() || (isSignedIn() && request.auth.uid == studentId);

      allow create: if isSignedIn() && request.auth.uid == studentId &&
        request.resource.data.paymentStatus == 'none' &&
        request.resource.data.progress == {} &&
        request.resource.data.keys().hasOnly(['name','email','paymentStatus','progress','createdAt']);

      allow update: if isAdmin() || (
        isSignedIn() && request.auth.uid == studentId &&
        request.resource.data.diff(resource.data).affectedKeys().hasOnly(['progress','paymentStatus','paymentRequestedAt']) &&
        request.resource.data.paymentStatus in ['pending', resource.data.paymentStatus]
      );

      allow delete: if isAdmin();
    }
  }
}