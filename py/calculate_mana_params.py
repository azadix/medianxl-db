import re
import math
import sys

def parse_input(input_str):
    """
    Parses input string in format like "[1: 10], [2: 12], [3: 14]"
    Returns a list of tuples (lvl, cost).
    """
    # Find all matches of [lvl: cost]
    matches = re.findall(r'\[(\d+)\s*:\s*(\d+)\]', input_str)
    data = []
    for lvl_str, cost_str in matches:
        data.append((int(lvl_str), int(cost_str)))
    return sorted(data)

def solve_mana_params(data):
    """
    Finds parameters (min_mana, lvl_mana, shift) that fit the data.
    Formula: Cost = floor( (min_mana + lvl_mana * (lvl - 1)) * (2^shift) / 256 )
    """
    solutions = []

    # Iterate through possible shift values
    # D2 shift is typically 0-8, but can be higher. 
    # 256 is 2^8.
    # If shift=8, factor is 1.
    # If shift < 8, factor < 1.
    # If shift > 8, factor > 1.
    
    for shift in range(0, 33): # Check reasonable range of shifts
        
        # Calculate bounds for the term (min_mana + lvl_mana * (lvl - 1))
        # Let Val = min_mana + lvl_mana * (lvl - 1)
        # Cost = floor(Val * 2^shift / 256)
        # Cost <= Val * 2^shift / 256 < Cost + 1
        # Cost * 256 / 2^shift <= Val < (Cost + 1) * 256 / 2^shift
        
        # We need integer Val.
        # ceil(Cost * 256 / 2^shift) <= Val <= floor(((Cost + 1) * 256 / 2^shift) - epsilon)
        # Since Val is integer, Val <= ceil((Cost + 1) * 256 / 2^shift) - 1
        
        # Let's define the range [MinVal, MaxVal] for each data point
        
        factor_num = 256
        factor_den = 1 << shift
        
        # We can simplify the bounds calculation
        # MinVal = ceil(Cost * 256 / 2^shift)
        # MaxVal = ceil((Cost + 1) * 256 / 2^shift) - 1
        
        points = []
        possible = True
        
        for lvl, cost in data:
            min_val = math.ceil(cost * factor_num / factor_den)
            max_val = math.ceil((cost + 1) * factor_num / factor_den) - 1
            
            if min_val > max_val:
                possible = False
                break
            points.append({
                'lvl': lvl,
                'min': min_val,
                'max': max_val
            })
            
        if not possible:
            continue
            
        # Now we need to find integers A (min_mana) and B (lvl_mana) such that
        # min_val <= A + B * (lvl - 1) <= max_val for all points
        
        # Bound B
        # For any pair of points i and j (lvl_j > lvl_i):
        # MinVal_j <= A + B*(lvl_j-1) <= MaxVal_j
        # MinVal_i <= A + B*(lvl_i-1) <= MaxVal_i
        # Subtracting:
        # MinVal_j - MaxVal_i <= B * (lvl_j - lvl_i) <= MaxVal_j - MinVal_i
        # (MinVal_j - MaxVal_i) / (lvl_j - lvl_i) <= B <= (MaxVal_j - MinVal_i) / (lvl_j - lvl_i)
        
        min_b = -float('inf')
        max_b = float('inf')
        
        # Check all pairs to tighten B bounds
        for i in range(len(points)):
            for j in range(i + 1, len(points)):
                p1 = points[i]
                p2 = points[j]
                dlvl = p2['lvl'] - p1['lvl']
                
                low = (p2['min'] - p1['max']) / dlvl
                high = (p2['max'] - p1['min']) / dlvl
                
                min_b = max(min_b, low)
                max_b = min(max_b, high)
        
        # B must be integer
        start_b = math.ceil(min_b)
        end_b = math.floor(max_b)
        
        if start_b > end_b:
            continue
            
        # Iterate through possible B values
        for b in range(start_b, end_b + 1):
            # For a fixed B, find range of A
            # MinVal <= A + B*(lvl-1) <= MaxVal
            # MinVal - B*(lvl-1) <= A <= MaxVal - B*(lvl-1)
            
            min_a = -float('inf')
            max_a = float('inf')
            
            valid_b = True
            for p in points:
                term = b * (p['lvl'] - 1)
                low = p['min'] - term
                high = p['max'] - term
                
                min_a = max(min_a, low)
                max_a = min(max_a, high)
                
                if min_a > max_a:
                    valid_b = False
                    break
            
            if valid_b:
                # Found a valid range for A. Pick the smallest non-negative A if possible, or just the smallest.
                # Usually min_mana is positive.
                
                # We prefer A >= 0
                final_start_a = math.ceil(min_a)
                final_end_a = math.floor(max_a)
                
                if final_start_a <= final_end_a:
                    # We have valid integer A values.
                    # Let's just pick one (e.g., the smallest positive one, or just smallest)
                    # If range includes 0 or positive, pick smallest non-negative.
                    # If all negative, pick largest (closest to 0).
                    
                    # Let's collect all valid (A, B, Shift)
                    # Just taking the lower bound for A is usually sufficient to define the line
                    
                    # Heuristic: prefer A >= 0
                    chosen_a = final_start_a
                    if chosen_a < 0 and final_end_a >= 0:
                        chosen_a = 0
                    
                    solutions.append({
                        'min_mana': chosen_a,
                        'lvl_mana': b,
                        'shift': shift,
                        'a_range': (final_start_a, final_end_a)
                    })

    return solutions

def parse_csv(filename):
    """
    Parses a CSV file where each line is "lvl,cost" or "lvl;cost"
    """
    data = []
    try:
        with open(filename, 'r') as f:
            for line in f:
                line = line.strip()
                if not line or not line[0].isdigit():
                    continue
                
                # Try comma or semicolon separator
                parts = line.replace(';', ',').split(',')
                if len(parts) >= 2:
                    try:
                        lvl = int(parts[0].strip())
                        cost = int(parts[1].strip())
                        data.append((lvl, cost))
                    except ValueError:
                        continue
    except FileNotFoundError:
        print(f"Error: File '{filename}' not found.")
        return []
        
    return sorted(data)

def main():
    import os
    
    # Check if mana_cost_input.csv exists in current directory or parent directory
    csv_name = 'mana_cost_input.csv'
    csv_path = csv_name
    
    # If not in current dir, check parent (since script is in /py/)
    if not os.path.exists(csv_path) and os.path.exists(os.path.join('..', csv_name)):
        csv_path = os.path.join('..', csv_name)
    
    # If command line argument provided, use that
    if len(sys.argv) > 1 and not sys.argv[1].startswith('['):
        csv_path = sys.argv[1]
        print(f"Reading from file: {csv_path}")
        data = parse_csv(csv_path)
    elif os.path.exists(csv_path):
        print(f"Found {csv_name}, reading data...")
        data = parse_csv(csv_path)
    elif len(sys.argv) > 1:
        # Assume string input like before
        input_str = " ".join(sys.argv[1:])
        data = parse_input(input_str)
    else:
        print(f"No '{csv_name}' found and no arguments provided.")
        print("Enter mana cost data in format: [lvl: cost], [lvl: cost]...")
        print("Example: [1: 10], [2: 12], [3: 14]")
        try:
            input_str = input("> ")
            data = parse_input(input_str)
        except EOFError:
            return

    if not data:
        print("No valid data found.")
        return

    print(f"Parsed {len(data)} data points: {data}")
    
    solutions = solve_mana_params(data)
    
    if not solutions:
        print("No exact solution found.")
    else:
        print(f"Found {len(solutions)} possible solutions:")
        # Sort by shift (usually lower shift is preferred or standard 8)
        # Also prefer non-negative min_mana
        
        solutions.sort(key=lambda x: (abs(x['shift'] - 8), x['min_mana']))
        
        for sol in solutions[:5]: # Show top 5
            print(f"Min Mana (initial): {sol['min_mana']}")
            print(f"Lvl Mana: {sol['lvl_mana']}")
            print(f"Shift: {sol['shift']}")
            print(f"Formula: floor(({sol['min_mana']} + {sol['lvl_mana']} * (lvl - 1)) * (2^{sol['shift']}) / 256)")
            print("-" * 20)

if __name__ == "__main__":
    main()
