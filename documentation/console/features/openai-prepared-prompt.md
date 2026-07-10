# OpenAI Prepared Prompt Integration

## Overview

This document describes the "Ask OpenAI about girl" feature in the content-finder CLI application.

## Menu Option

The feature is available as option **5** in the main menu:

```
1. PrintAllGirls
2. TodoGirls
3. Statuses Setup
4. FilterStatuses
5. Ask OpenAI about girl
0. Exit
```

## Environment Variable

The feature requires the following environment variable to be set:

```
OPENAI_API_KEY=your-openai-api-key-here
```

**Important:** Never log or expose the API key in any output.

## Configuration

The OpenAI integration uses a prepared prompt with the following configuration:

- **Prompt ID:** `pmpt_6a2d9932e7708197bf9a60767e94dcfb07c8292b52f64217`
- **Version:** `1`

## Flow

1. **Check API Key**: If `OPENAI_API_KEY` is not set, display a warning message and return to the main menu without crashing.

2. **Fetch Girls List**: Retrieve all girls from the repository using `GetAllGirls()`.

3. **Select Girl**: Show an interactive picker using `@clack/prompts` to select which girl to analyze.

4. **Collect Data**: Gather all available data for the selected girl:
   - Status (from `GetGirlsStatuses()`)
   - Todo items (from `TodoGirls()`)
   - Other items found recursively under the girl's folder

5. **Build Current Case Prompt**: Build the `<current_case>` prompt using data from data providers:
   - `full-report` - fetched from `getFullReport()` data provider
   - `messages` - fetched from the full report data

6. **Display Preview**: Show the complete prompt that will be sent to OpenAI.

7. **Ask for Confirmation**: Ask user "Wysłać ten prompt do OpenAI?" with options:
   - `1. tak` - proceed with sending
   - `2. nie / wróć` - cancel and return to menu

8. **Call API**: (Only if confirmed) Send the request to OpenAI Responses API using the prepared prompt.

9. **Display Response**: Show the OpenAI answer in the terminal.

10. **Return to Menu**: After pressing Enter, return to the main menu.

## Input Format

The input sent to the OpenAI prompt follows this structure:

```
<current_case>
name: {girl_name}

context:
  date_met: {date}, {contact_type}
  seed: {seed}

full-report:
  //{girl_name}
    - {detail1}
    - {detail2}
    ...

messages:
  - p4_she: {message_content}
  - p3_you: {message_content}
  - p2_she: {message_content}
  - p1_you: {message_content}

my_question:
  {question_text}
</current_case>
```

### Messages Format Rules

- Messages are raw conversation data, not analysis
- Show full relevant conversation fragment, not just the last message
- Line order: oldest at top, newest at bottom
- Reverse numbering: p1 = newest/last message, higher p = older message
- `you` = my message
- `she` = girl's message
- Do not add system messages like "end-to-end encrypted" or "Amelia is a contact"

## Error Handling

### Missing API Key
If `OPENAI_API_KEY` is not set:
```
⚠️  Missing OPENAI_API_KEY env variable.
Please set it in your .env file.
```
The process returns to the main menu without crashing.

### OpenAI API Error
If OpenAI returns an error:
- Display the error message
- Return to the main menu
- Do not crash the process

### Empty Response
If `response.output_text` is empty:
- Display a warning message
- Return to the main menu

## Code Structure

The OpenAI integration is implemented in a separate module:

```
src/openai/
├── askOpenAiAboutGirl.ts    # Main flow and API integration
└── dataProviders.ts         # Data providers for full-report and messages
```

### Key Functions

**askOpenAiAboutGirl.ts:**
- **`askOpenAiAboutGirlFlow()`**: Main entry point for the feature
- **`getGirlsList()`**: Fetches and returns all girls from the repository
- **`selectGirl(girls)`**: Shows an interactive picker for girl selection
- **`collectGirlData(girl)`**: Gathers all data for a specific girl
- **`findItemsRecursively(loca)`**: Finds items recursively under a path
- **`buildCurrentCasePrompt(girl, items)`**: Builds the `<current_case>` prompt using data providers
- **`buildGirlOpenAiInput(girl, items)`**: Builds the legacy formatted input text (fallback)
- **`callOpenAiPreparedPrompt(inputText)`**: Calls the OpenAI Responses API

**dataProviders.ts:**
- **`getFullReport(girlName)`**: Gets the full report for a girl (currently mocked for Marzena Styk)
- **`getMessages(girlName)`**: Gets messages for a girl (derived from full report)

## Dependencies

- `openai` - Official OpenAI Node.js SDK
- `@clack/prompts` - For interactive CLI prompts

## Usage

```bash
# Set the API key in .env
echo "OPENAI_API_KEY=sk-..." >> .env

# Run the CLI
npm run cli

# Select option 5 from the main menu
```

## Security Notes

1. **Never commit API keys**: The `.env` file is in `.gitignore`
2. **Never log API keys**: The code explicitly avoids logging sensitive information
3. **Graceful degradation**: Missing API key doesn't crash the application
4. **Error isolation**: OpenAI errors are caught and handled without affecting other features