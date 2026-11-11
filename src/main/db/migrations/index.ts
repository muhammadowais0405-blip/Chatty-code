import m001 from './001_init.sql?raw'
import m002 from './002_fts5.sql?raw'
import m003 from './003_prompts.sql?raw'
import m004 from './004_prompt_sets.sql?raw'
import m005 from './005_system_messages.sql?raw'

export const migrations: { name: string; sql: string }[] = [
  { name: '001_init.sql', sql: m001 },
  { name: '002_fts5.sql', sql: m002 },
  { name: '003_prompts.sql', sql: m003 },
  { name: '004_prompt_sets.sql', sql: m004 },
  { name: '005_system_messages.sql', sql: m005 }
]