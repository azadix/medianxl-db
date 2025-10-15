import sqlite3

def analyze_skill_status():
    """
    Analyzes the status of skills from missingskills.md against the database.
    Categorizes skills into three lists:
    1. Not in database at all
    2. In database but missing description
    3. Completed (in database with description)
    """
    
    # Read the todo list
    with open('../missingskills.md', 'r') as f:
        todo_skills = [line.strip() for line in f.readlines() if line.strip()]

    # Connect to database
    conn = sqlite3.connect('../skills-2.11.sqlite')
    cursor = conn.cursor()
    
    # Get all skills with their display names and descriptions
    cursor.execute('''
        SELECT display_name, description 
        FROM skills 
        WHERE display_name IS NOT NULL AND display_name != ""
        ORDER BY display_name
    ''')
    results = cursor.fetchall()
    
    # Create lookup dictionaries
    db_skills_with_desc = {}
    db_skills_without_desc = {}
    
    for display_name, description in results:
        if description and description.strip():
            db_skills_with_desc[display_name.lower()] = display_name
        else:
            db_skills_without_desc[display_name.lower()] = display_name
    
    conn.close()
    
    # Categorize skills
    not_in_db = []
    in_db_no_desc = []
    completed = []
    
    for todo_skill in todo_skills:
        todo_lower = todo_skill.lower()
        
        if todo_lower in db_skills_with_desc:
            completed.append((todo_skill, db_skills_with_desc[todo_lower]))
        elif todo_lower in db_skills_without_desc:
            in_db_no_desc.append((todo_skill, db_skills_without_desc[todo_lower]))
        else:
            not_in_db.append(todo_skill)
    
    # Print results
    print("SKILL STATUS ANALYSIS")
    print("=" * 60)
    print(f"Total skills in todo list: {len(todo_skills)}")
    print(f"Not in database: {len(not_in_db)}")
    print(f"In database but missing description: {len(in_db_no_desc)}")
    print(f"Completed (in database with description): {len(completed)}")
    print()
    
    print("1. SKILLS NOT IN DATABASE")
    print("=" * 40)
    for skill in not_in_db:
        print(f"[MISSING] {skill}")
    
    print()
    print("2. SKILLS IN DATABASE BUT MISSING DESCRIPTION")
    print("=" * 50)
    for todo_skill, db_skill in in_db_no_desc:
        print(f"[NO DESC] {todo_skill}")
    
    print()
    print("3. COMPLETED SKILLS (IN DATABASE WITH DESCRIPTION)")
    print("=" * 55)
    for todo_skill, db_skill in completed:
        print(f"[DONE] {todo_skill}")
    
    print()
    print("SUMMARY")
    print("=" * 20)
    print(f"Completion rate: {len(completed)}/{len(todo_skills)} ({len(completed)/len(todo_skills)*100:.1f}%)")
    print(f"Skills needing description: {len(in_db_no_desc)}")
    print(f"Skills needing to be added: {len(not_in_db)}")

if __name__ == "__main__":
    analyze_skill_status()
