import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface JournalEntry {
  title: string
  message: string
}

interface JournalState {
  entries: JournalEntry[]
  loading: boolean
}

const initialState: JournalState = {
  entries: [],
  loading: false,
}

export const journalSlice = createSlice({
  name: 'journal',
  initialState,
  reducers: {
    addEntry: (state, action: PayloadAction<JournalEntry>) => {
      state.entries.push(action.payload)
    },
    setEntries: (state, action: PayloadAction<JournalEntry[]>) => {
      state.entries = action.payload
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload
    },
  },
})

export const { addEntry, setEntries, setLoading } = journalSlice.actions

export default journalSlice.reducer
