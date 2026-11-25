export const amenitiesSource = 'https://library.stonybrook.edu/services/access-services/places-to-study/'

type LibraryDetails = {
  setting: string
  scope: string
  facilitiesName?: string
  amenities: { value: string; label: string }[]
  facilities: string[]
  // Local optimized assets; sources and unresolved reuse permissions are documented.
  photo?: { src: string; alt: string; credit: string; sourceUrl: string; position: string }
}

/** Static facilities checked against SBU Places to Study on November 24, 2026.
 * Counts describe installed facilities, never live availability or sensor coverage.
 */
export const libraryDetails: Record<number, LibraryDetails> = {
  1: {
    photo: { src: '/images/library/north_reading_room.webp', alt: 'Students studying at tables and lounge seating in the North Reading Room atrium.', credit: 'Stony Brook University News', sourceUrl: 'https://news.stonybrook.edu/university/stony-brook-university-libraries-named-finalist-for-international-innovation-award/', position: '50% 60%' },
    setting: 'Individual & group study',
    scope: 'Facilities listed by SBU for the North Reading Room.',
    amenities: [{ value: '44', label: 'Computer seats' }, { value: '700+', label: 'Outlets' }, { value: '12', label: 'Group study rooms' }],
    facilities: ['Printing & scanning', 'Screen sharing', '40-seat Learning Lab', 'Individual, pair & group seating'],
  },
  2: {
    photo: { src: '/images/library/central_reading_room.webp', alt: 'Students working at shared tables in the Central Reading Room.', credit: 'Stony Brook University Libraries', sourceUrl: 'https://library.stonybrook.edu/redesigned-spaces/', position: '50% 65%' },
    setting: 'Individual & group study',
    scope: 'Facilities listed by SBU for the Central Reading Room.',
    amenities: [{ value: '46', label: 'Computer seats' }, { value: '500+', label: 'Outlets' }, { value: '4', label: 'Collaborative study rooms' }, { value: '6', label: 'Graduate study rooms' }],
    facilities: ['Printing & scanning', 'Screen sharing', 'Reading nook', 'Individual, pair & group seating'],
  },
  3: {
    photo: { src: '/images/library/health_sciences.webp', alt: 'Bookshelves beside window-side study carrels in the Health Sciences Library.', credit: 'LinkedIn', sourceUrl: 'https://www.linkedin.com/posts/william-wertheim-3a75299_stonybrook-healthsciences-activity-7146228317656948736-8_3T', position: '50% 52%' },
    setting: 'Library-wide facilities',
    scope: 'Library-wide facilities; sensor coverage may differ.',
    amenities: [{ value: '22', label: 'Computer workstations' }, { value: '600+', label: 'Outlets' }, { value: '184', label: 'Study carrels' }],
    facilities: ['Individual & group study tables', 'Lounge chairs & sofas'],
  },
  4: {
    photo: { src: '/images/library/music_library.webp', alt: 'Bookshelves and rows of study tables in the Music Library.', credit: 'Stony Brook University Libraries on Facebook', sourceUrl: 'https://www.facebook.com/stonybrooklibrary/photos/good-luck-to-all-stony-brook-university-students-on-your-finals-if-youre-looking/10162784796475010/', position: '50% 50%' },
    setting: 'Listening & quiet study',
    scope: 'Facilities listed by SBU for the Music Library.',
    amenities: [{ value: '14', label: 'Mac computer seats' }, { value: '5', label: 'Dell computer seats' }, { value: '52', label: 'Listening-station seats' }],
    facilities: ['Small & large study tables', 'Lounge seating', 'Music media, scores & books'],
  },
  5: {
    photo: { src: '/images/library/third_floor.webp', alt: 'Curved red staircase overlooking library study tables, used for the 3rd Floor location.', credit: 'Stony Brook University Libraries', sourceUrl: 'https://library.stonybrook.edu/redesigned-spaces/', position: '50% 65%' },
    setting: 'University-monitored space',
    facilitiesName: 'Main Stacks',
    scope: 'Main Stacks facilities; sensor coverage may differ.',
    amenities: [{ value: '56', label: 'Small-table seats' }, { value: '199', label: 'Study carrel seats' }, { value: '4', label: 'Lounge chairs' }, { value: '276+', label: 'Outlets' }],
    facilities: ['Quiet study', 'Books & media'],
  },
}
