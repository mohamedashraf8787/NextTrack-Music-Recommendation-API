
# NextTrack – Music Recommendation API

### Advanced Web Design 7.2 – Final Project

**Developed by:** Mohamed Ashraf Abdelrahman Elshaear

## 1. Project Overview

NextTrack is a lightweight, session-based music recommendation system designed to suggest suitable next tracks based on the user's current listening session rather than long-term listening history.

The project combines weighted content-based filtering, mood-aware recommendation, a Mood Journey Generator, passive mood detection, and explainable recommendations within a RESTful API and browser-based application.

The system aims to provide a more contextual, transparent, and privacy-conscious music listening experience.

## 2. Main Features

- Session-based music recommendation
- Weighted content-based filtering
- Mood Journey Generator
- Passive mood detection
- Explainable recommendations with confidence scores
- RESTful API
- Local music library management
- Browser-based music player and interface
- Automatic music metadata generation

## 3. Technologies Used

| Technology | Purpose |
|------------|---------|
| Node.js | Backend server |
| JavaScript | Recommendation engine and application logic |
| HTML5 | Frontend structure |
| CSS3 | Interface design |
| REST API | Frontend-backend communication |
| JSON | Music metadata storage |

## 4. Project Structure

```text
NextTrack-Music-Recommendation-API/
│
├── public/
│   ├── app.js
│   ├── index.html
│   ├── metadata-generator.html
│   ├── metadata-generator.js
│   └── styles.css
│
├── server/
│   ├── musicLibrary.js
│   ├── recommendationEngine.js
│   └── trackData.js
│
├── server.js
├── package.json
├── .gitignore
└── README.md
```

## 5. Installation and Setup

### Requirements

- Node.js
- A modern web browser
- Local audio files for testing

### Running the Application

1. Download or clone this repository.

2. Open the project folder in Visual Studio Code or a terminal.

3. Start the application:

```bash
npm start
```

4. Open the following URL in your browser:

http://localhost:4173

The application should now be accessible locally.

### Adding Music Files

NextTrack uses a local music library.

Create the following directory if it does not already exist:

```text
public/music/
```

Add audio files that you have permission to use.

Supported audio formats include MP3, WAV, M4A, and OGG.

The music library is excluded from the public GitHub repository to avoid redistributing copyrighted audio files.

### Generating Music Metadata

After adding music files, open:

http://localhost:4173/metadata-generator.html

Use the metadata generator to analyse the local music collection and save the generated metadata.

The metadata is stored in:

```text
public/music/metadata.json
```

The metadata includes musical attributes such as tempo, energy, valence, genre, and mood.

These attributes are used by the recommendation engine.

## 6. How NextTrack Works

### Session-Based Recommendation

The system analyses the current listening session and compares its characteristics with available tracks.

Recommendations are ranked using four main components:

- Transition continuity
- Target alignment
- Genre compatibility
- Mood compatibility

An artist repetition penalty is also applied to encourage diversity.

### Mood Journey Generator

The Mood Journey Generator allows users to select a starting mood and a target mood.

The system generates a sequence of recommended tracks intended to move gradually between these emotional states.

For example:

Melancholic → Uplifting

### Passive Mood Detection

The system analyses the three most recent tracks using their energy and valence values.

When both average energy and average valence fall below the predefined threshold, NextTrack provides a supportive suggestion to start an uplifting Mood Journey.

This feature analyses listening patterns rather than diagnosing the listener's emotional or psychological state.

### Explainable Recommendations

NextTrack provides explanations describing the characteristics contributing to a recommendation, such as tempo continuity, genre compatibility, and mood alignment.

A score-based confidence value is also displayed.

## 7. REST API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| /api/library | GET | Retrieve the local music library |
| /api/recommend | POST | Generate ranked next-track recommendations |
| /api/journey | POST | Generate a Mood Journey |
| /api/detect-mood | POST | Analyse recent listening patterns |
| /api/metadata | POST | Save generated music metadata |

## 8. Project Limitations

NextTrack is an academic prototype rather than a commercial music streaming platform.

The evaluation was conducted using a limited local music collection.

Recommendation quality depends on the availability and quality of music metadata.

Mood Journeys do not always converge perfectly on the selected target mood, and confidence values represent internal recommendation scores rather than experimentally calibrated user satisfaction.

## 9. Academic Information

**Project:** NextTrack – A Music Recommendation API

**Template:** Advanced Web Design 7.2

**Project Type:** Final University Project

**Author:** Mohamed Ashraf Abdelrahman Elshaear

This repository contains the source code developed for the NextTrack final project.
