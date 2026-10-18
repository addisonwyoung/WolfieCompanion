# Wolfie Companion Authentication & Data Persistence
## Authentication - Sign-in Flow
Wolfie Companion uses Google sign-in through Supabase Auth with PKCE. 
1. Student selects Continue with Google and the application calls Supabase Auth’s `signInWithOAuth` using Google. Application redirects users to `/auth/callback` after authentication and uses `hd=stonybrook.edu` to suggest Stony Brook University Google accounts during sign-in.
2. Supabase SDK creates and stores a PKCE verifier (randomly generated secret) and directs the browser to Google.
3. Google authenticates the student and returns its response to Supabase’s authentication endpoint `/auth/v1/callback`.
4. After processing Google’s authentication, Supabase redirects the browser to the application’s `/auth/callback` route with an authorization code.
5. The Supabase SDK uses the authorization code and the PKCE verifier to securely complete the student’s login and create a session. 

`onAuthStateChange` is a Supabase function that listens for authentication events, such as sign-ins, sign-outs, and token refreshes, allowing the application to update its UI accordingly. 

`auth.users` Table
* User ID (UID)
* Display Name
* Email Address
* Phone (Optional)
* Authentication Provider (Google)
* Provider Type (Social)
* Account Creation Timestamp
* Last Sign-In Timestamp 

## Authorization - Eligibility
`private.is_eligible()` is a database function that checks four requirements:
* Authenticated user ID matches an Auth user 
* User has a confirmed Stony Brook email address
* Linked Google identity with `email_verified=true`
* Google account email matches Auth email 

When a student signs in with Google, the application calls `account_is_eligible()` to check their eligibility. If the student is eligible, the application enters its ready state after successfully loading their profile and classes. Otherwise, the application signs out the local session.  

## Profile
Once an eligible student’s account loads, the Dashboard view presents the student’s profile.

Each student has one row in the `public.profiles` table in Supabase where the profile is linked to the student’s authentication account using the same UUID.

`public.profiles` Table
* `id` (UUID)
* `name` (text)
* `major` (text) - optional
* `year` (text) - optional
* `residence_status` (text) - optional
* `interests` (text[]) - optional 
* `avatar_path` (text) - optional 
* `created_at` (timestamptz)
* `updated_at` (timestamptz)

There are two methods for creating profiles to ensure that any eligible student has a profile when accessing the application:
* Database Trigger: Automatically creates a profile using the student’s name from their Supabase Auth metadata.
* `public.ensure_profile()`: Ensures an eligible student has a profile when their account loads, creating one if it does not already exist

Profile access is restricted to the profile owner through Row-Level Security (RLS), which enforces two conditions:
* The student must be eligible to use Wolfie Companion
* The authenticated student’s user ID must match the profile’s ID

Profile pictures are stored in a private Supabase Storage bucket, while the profile table stores the path to each image. Each student has their own storage path, and the avatar endpoint verifies the student’s Supabase authentication token and eligibility before allowing authorized operations. 

## Saved Classes
The dashboard allows students to add and save course codes and sections either manually or by importing a screenshot of their schedule.

Google Cloud Vision is used to extract course information from schedule screenshots.
1. The student uploads a PNG or JPEG screenshot, selects either the SOLAR class list or weekly calendar format, and clicks Extract classes.
2. The browser sends the uploaded image to the Express backend through `POST /api/schedule-preview`.
3. Express validates the image and sends it to Google Cloud Vision for document text detection. The extracted text is then parsed to identify potential course codes and sections. 
4. The application displays the extracted courses in an unverified preview, allowing the student to review and correct any errors. 
5. Once the student clicks Add to Your courses, the reviewed courses are saved to Supabase through the application’s normal data-saving process.

`public.user_courses` Table - stores the course code and owning user ID
* `id` (UUID)
* `user_id` (UUID)
* `course_code` (text)
* `created_at` (timestamptz)
* `updated_at` (timestamptz)

`public.user_course_sections` Table - stores sections linked to a saved course
* `user_course_id` (UUID)
* `section` (text)

`public.save_enrollments()` validates and saves the submitted course and section data for the authenticated student, while RLS ensures that only the eligible owner can access their own course and section information.

## Course Offerings
`public.course_offerings` Table 
* `id` (text) 
* `course_code` (text)
* `course_title` (text)
* `professor_name` (text)
* `semester` (text)
* `academic_year` (int)

## Course Evaluations
`public.course_reviews` Table 
* `id` (UUID)
* `offering_id` (text)
* `user_id` (UUID)
* `weekly_hours` (number)
* `difficulty` (int2)
* `review` (text)
* `created_at` (timestamptz)

A unique constraint on `(user_id, offering_id)` allows a student at most one review for an exact offering, while allowing reviews for different offerings. The application submits only the selected offering ID and the student’s hours, difficulty, and review text. It does not supply the reviewer ID. 

## Anonymous Review Reads

`public.course_reviews_public` is a view that joins reviews with course offering details, including the course, professor, term, and review content, while excluding reviewer IDs and profile information to protect privacy.

The application writes reviews to `course_reviews` and retrieves them through `course_reviews_public`. The view uses `security_invoker=true`, an eligibility-based RLS policy, and column-limited permissions to ensure that the querying student’s permissions are enforced and reviewer identities remain hidden. 
