# Wolfie Companion
CSE 416 Project - Harvey Cao, Karen Elshemy, Mina Jaromy, Addison Young

Wolfie Companion is a social and utility platform for Stony Brook students. It provides a centralized application for students to connect with one another while promoting academic productivity. 
## Problem Statement
Stony Brook students often rely on multiple disconnected platforms (Navigate360, CampusGroups, SBEngaged Website, GroupMe, etc.) to manage their academic and campus lives. Existing student communities are scattered across messaging apps, social media, and university-supported platforms, making it difficult for students to connect with classmates and manage their productivity. In addition, these platforms lack the connection piece in that they don’t have algorithms to recommend students who you may get along with. This fragmentation can also make it harder to stay organized, manage time effectively, collaborate with classmates, make informed course decisions, and find suitable study spaces. Our app aims to improve student productivity and connection by centralizing these everyday needs into one student-focused platform that provides scheduling and planning tools, course-based student communities, campus study space information, real-time crowd reporting, and verified anonymous course evaluations.
## Target Users
### Stony Brook Students
This application is specifically designed for students who want to improve their academic productivity, connect with classmates, and more easily navigate through campus resources. This application may be particularly useful for freshmen and transfer students who are transitioning into a new academic and social environment. Commuter students may also benefit from having an easier way to meet other classmates, discover study groups, and campus resources despite spending less time on campus. 
## Why is it a semester-long project?
* **Stony Brook student verification:** Users are required to log in using their Stony Brook email account and verify their email address before being granted access to the application, ensuring a secure and safe environment for students.
* **Automatic class retrieval from uploaded schedule:** Users can upload an image of their schedule and the application will automatically retrieve their classes, help them connect with other students enrolled in the same courses, and display reviews for those courses.
* **Student recommendations:** Users will be recommended to other students 
who share the same major, have similar interests, or are enrolled in the same courses.
* **Multiple workflows that are interconnected:** Student dashboard, group chats, individual student messaging, course assignment reminders, course ratings/reviews, study spot finder
* **Real-time system:** Users can update their availability status and provide 
information about study spot availability, requiring the application to update and retrieve data continuously and without delay.
* **User-friendly interface:** Due to the many features the application provides, 
significant testing is needed to ensure that each workflow functions effectively and that the platform is organized, cohesive, and easy for users to navigate. 
* **Scalable database:** The application must account for a large student user 
base and therefore be able to store many users, courses, and large amounts of shared data while maintaining reliable and efficient CRUD operations. 
* **Future maintenance of data:** Ensuring that data is well-maintained and free 
of unnecessary duplicates or overlapping user data as more users interact with the application, given the large amount of user-generated data that must be stored and managed. 
## Scope
### Inside of Scope (V1)
* User accounts and profiles
* Schedule importing
* Group profiles & meeting recommendations
* Classmate discovery
* Direct messaging
* Study groups
* Study-location reports
* Anonymous course evaluations
### Outside of Scope
* "Who's Free Now" availability matching
* Roommate & housing matching
* Student marketplace
* Discussion forums
* Lost and found board
* Not a replacement for Solar course registration and Brightspace
  
**These features may be added in future versions but are not part of the core functionality of the application.** 
## Requirements
### 1. Schedule upload & classmate discovery
**What:** Students must be able to upload or enter their class schedule and identify other users who share the same classes.  
**How:** The system should accurately extract course information to allow students to confirm or correct detected classes. This should only display profile information the student wishes to share.
### 2. Student communication
**What:** Students must be able to message classmates and create group chats for course-related or social communication.  
**How:** Messages should persist across sessions, update reliably, and only be visible to the intended participants. 
### 3. Student recommendations
**What:** The application must recommend potential friends, study partners, or classmates based on shared characteristics such as courses, majors, interests, and academic goals.  
**How:** Recommendations should be ranked using relevant profile and schedule information and should allow users to choose what information is considered.
### 4. Study group formation & scheduling
**What:** Students must be able to find classmates with compatible courses to form study groups, and compare group members’ schedules to find possible meeting availability.  
**How:** The app should calculate overlapping availability between students who have different schedules and clearly display suitable time windows for the group.
### 5. Study space discovery & crowd reporting
**What:** Students must be able to browse campus study spaces and view student-reported crowd levels.  
**How:** Crowd reports should include timestamps, recent reports should be prioritized, and users should be able to filter study spaces by characterization: location, noise level, and amenities. 
### 6. Productivity & assignment management
**What:** Students must be able to track upcoming assignments and receive reminders of important deadlines for exams, projects, and homeworks.  
**How:** Deadlines should remain saved across sessions and reminders should be presented early enough to be helpful.
### 7. Anonymous course evaluations
**What:** Verified Stony Brook students must be able to view previous course evaluations and anonymously submit feedback for courses they have taken.  
**How:** Evaluations should include structured information such as workload, difficulty, and overall experience, while the identity of the student will be hidden. 
### 8. Student account verification & privacy
**What:** Users must be able to create accounts and verify that they are affiliated with Stony Brook University.  
**How:** Verification and authentication credentials must be stored securely and student-only functionality must be restricted to these verified accounts.

## Roles

## Rough Architecture Sketch





