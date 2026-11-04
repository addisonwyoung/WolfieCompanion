# Wolfie Companion Authentication & Data Persistence of Implemented Features
## Authentication - Sign-in Flow
Google sign-in through Supabase Auth with PKCE is used: 
1. Student selects Continue with Google and the application calls Supabase Auth’s `signInWithOAuth` using Google. The application redirects users to `/auth/callback` after authentication and uses `hd=stonybrook.edu` to ensure that only Stony Brook students can sign in.
2. Supabase SDK creates and stores a PKCE verifier (a randomly generated secret) and directs the browser to Google.
3. Google authenticates the student and returns its response to Supabase’s authentication endpoint `/auth/v1/callback`.
4. Supabase redirects the browser to the application’s `/auth/callback` route with an authorization code.
5. The Supabase SDK uses the authorization code and the PKCE verifier to securely complete the student’s login and create a session. 

## Profile
After a student logs into the application, the Dashboard shows the student’s profile, where each student has one record in the `public.profiles` table in Supabase.

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
* `share_year` (bool)
* `share_residence_status` (bool)
* `share_avatar` (bool)
* `allow_new_dms` (bool)

The function `public.ensure_profile()` creates a profile for the student if one does not already exist and ensures that the student has a profile when loading into the application. 

Profile pictures are stored in a private Supabase Storage bucket and the path to each profile image is stored in the `profiles` table.

## Saved Classes
Students are able to add and save classes in the dashboard either manually or by importing a screenshot of their schedule. This collects information such as course codes, sections, and professors. The database checks these saved courses through the `course_catalog` table and determines whether that course has been verified or not. 


Google Cloud Vision is used to extract course information from schedule screenshots.
1. The student uploads a PNG or JPEG screenshot, selects either the SOLAR class list or weekly calendar format, and clicks Extract classes.
2. The browser sends the uploaded image to the Express backend through `POST /api/schedule-preview`.
3. Express validates the image and sends it to Google Cloud Vision for document text detection. The extracted text is then parsed to identify course codes and sections. 
4. The application displays the extracted courses in an unverified preview, allowing the student to review and correct any errors. 
5. Once the student clicks Add to Your courses, the courses are saved to Supabase.

When adding a class, the professor dropdown retrieves all verified professors from the `course_professors` table corresponding to that specific course. Students are also given the option to select Other and manually enter the professor’s name if that professor is not listed. Three scenarios can occur when a student saves a course:
* **Verified course and professor:** The database creates or reuses a `course_offerings` record corresponding to that specific course, section, and professor and sets the enrollment to `verified`. The student is now able to access and submit evaluations for that course, view classmates, and receive classmate recommendations. 
* **Verified course but professor is not verified:** The database saves the course and creates a record in the `verify_courses` table with the enrollment set to `pending`. The course appears on the dashboard, but the student cannot access or submit evaluations, view classmates, or receive classmate recommendations. 
* **Course is not verified:** The database creates a record in the `verify_courses` table and sets the enrollment to `pending` until the course is added to the `course_catalog` table and is verified.	

When a student saves a course, the application determines the current semester and academic year. The dashboard follows the academic calendar such that when a new semester begins, the dashboard refreshes to allow students to manually enter or upload their new class schedules.

`public.save_enrollments()` saves the submitted courses, sections, and professors. RLS ensures that only the logged-in student is able to access their own enrolled courses. 

`my_current_enrollments()` retrieves the logged-in student’s current enrolled courses from the `course_enrollments` table and displays them on the dashboard. Previous enrollment records from past semesters remain in the table but are no longer shown on the dashboard.

## Messaging
Messages are updated in real time through Supabase Realtime subscriptions and new messages are checked for every 10 seconds. 

**Direct Messages:**

When a student sends a message to another student for the first time, the database creates a record in the `dm_conversations` table containing both students’ user IDs. A unique constraint ensures that each pair of students can only have one conversation. 

The `dm_contact_state()` function checks whether a student can send the first message to another student. A student can send a message only if the pair of students are friends, have a pending friend request, or share a course. However, if a student does not have Allow New Direct Messages on, others are unable to start a conversation with them.

The `dm_read_positions` table stores each student’s last read message sequence number for each conversation, while the `dm_conversations` table stores when the last message was sent. This allows the application to sort conversations by most recent activity and preview the most recent unread message. 

**Group Chats:**

When a student creates a new group chat or adds members to an existing group chat, the `group_friend_candidates()` function retrieves all friends who can be added to the group and are allowing new messages. Each group chat can have up to 50 members and only the student who created the group can add or remove members.

The database assigns a `joined_after_sequence` restriction to each new member added to an existing group chat, preventing them from being able to view messages that were sent before they joined.  

The `group_members` table stores a `last_read_sequence` number for each member of a group chat. This allows the application to track each member’s unread messages within a conversation and preview the most recent unread message in that group chat for that student. 

## Course Reminders (Planner)
A student can select a course they are currently enrolled in and create or edit a course reminder by entering information such as the task name, task type (assignment, quiz, exam, or project), due date, and any additional notes. Students can also delete reminders or mark them as completed. 

Each course reminder is stored in the `academic_items` table, which includes a `user_course_id` to associate the reminder with its corresponding course. This allows reminders to be easily filtered by task type and course. 

Course reminders have different statuses: Overdue, Today, Upcoming, and Completed. Students can view which reminders are still pending and which have been completed. 

Course reminders can be displayed in two different types of views:
* **Agenda View:** Displays reminders as a compact list
* **Calendar View:** Displays reminders on a calendar based on their due dates

Students are notified about upcoming due dates and can modify their reminder settings for when they want to be notified for each task. 

## Campus Map Explorer
A student can view the campus map to find the locations of different campus resources and amenities, including printers, microwaves, water fountains, outdoor lounges, and study spots. 

Locations are stored in the `campus_locations` table with their corresponding latitude and longitude coordinates.

Row-level security (RLS) ensures that students can only view published locations, while only authorized map editors can add, edit, or delete locations. Authorized map editors can create new locations and save them as drafts. Once finalized, editors can publish the location so students can view the new updated map. 

Each location includes its name, category, reference source link, directions, description, and confirmation timestamp.

The map uses MapTiler tiles to display the map’s background. 

## Study Groups
This feature allows students in a shared course to create study groups for group projects and course preparation. Each student added to a study group is given the option to either accept or decline the invitation. 

The members of a study group can input their availability times and the feature will find a matching time where all members are free and can meet. The availability times of each member is stored in the `study_group_availability` table.

There is also a shared note board which allows members of a study group to provide live reminders or tasks/goals for every member to see, which is stored in the `study_group_tasks` table. Each member of the group can also be assigned a role to maintain course responsibilities.

## Study Spaces
SBU libraries use sensors within entrances of each library study space. This information is used to supply real-time updates (in addition to using historical data) as a crowd meter service for students. Pending status on approval for use of data.

## Friend Requests + Friend Recommendations
When a student selects a verified course from the dashboard, all students that aren’t friends with the logged-in student and are currently enrolled in that same course and section are shown in the recommended section through the `course_recommendation_profiles()` database function. 

The recommended students are ranked by highest to lowest similarity score, with the percentage shown, and a list of shared attributes, such as interests, academic year, residence status, and enrolled courses, is displayed. 

These are the breakdowns used to calculate the similarity score:
* **Same major:** 25 points
* **Each shared interest:** 6 points, up to 30 points
* **Each shared course:** 5 points, up to 25 points
* **Same academic year:** 10 points
* **Same residence status:** 10 points

There is an Add Friend button shown for each recommended student, which calls the database’s `send_friend_request()` function. A unique constraint prevents duplicate pending friend requests between the same pair of students. 

The Friend Requests section shows all requests sent to the student, including the sender’s name and major, along with options to view their profile, accept the request, or decline it. These requests are stored in the `friend_requests` table.
* **Accepting a friend request:** Creates a record in the `friendships` table using the two students’ IDs
* **Declining a friend request:** Removes it from the list of pending requests

Students can use the Add a Friend feature to search for students, even if they do not share any courses, view their profiles, and send friend requests. Students can also unfriend existing friends, which deletes the corresponding record from the `friendships` table.

## Course Offerings
`public.course_offerings` Table 
* `id` (text) 
* `course_code` (text)
* `course_title` (text)
* `professor_name` (text)
* `semester` (text)
* `academic_year` (int)
* `course_number` (text)
* `section` (text)
* `professor_first_name` (text)
* `professor_last_name` (text)
* `catalog_verified` (bool)

For each unique combination of a verified course, professor, section, semester, and academic year, a new record is created in the `course_offerings` table. Each review submitted to a course is associated with its specific course offering through that offering’s ID. 

Students can view a list of all course offerings and their corresponding reviews as well as a separate list of their current course offerings and reviews based on the courses they are currently enrolled in.

## Course Evaluations
`public.course_reviews` Table 
* `id` (UUID)
* `offering_id` (text)
* `user_id` (UUID)
* `weekly_hours` (number)
* `difficulty` (int2)
* `review` (text)
* `created_at` (timestamptz)
* `moderation_status` (text)
* `class_rating` (int2)
* `would_recommend` (bool)

A student can submit reviews only for course offerings they are currently or were previously enrolled in. A unique constraint on `(user_id, offering_id)` ensures that a student can submit only one review per course offering, while still allowing them to submit reviews for different offerings. The application does not display the reviewer’s ID.

## Anonymous Review Reads

`public.course_reviews_public` is a view that allows students to view reviews submitted by other students for selected course offerings while excluding reviewer IDs and profile information to maintain anonymity.

The application writes reviews to `course_reviews` and retrieves them through `course_reviews_public`. The view uses `security_invoker=true` to ensure that reviewer identities are never shown. 
