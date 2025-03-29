import json
# Specify the input and output file paths
input_file_path = 'responsecoco2d (2).txt'  # Replace with your input file name
output_file_path = 'outputs.txt'  # Replace with your desired output file name
# Open the input file for reading and the output file for writing
with open(input_file_path, 'r') as infile, open(output_file_path, 'w') as outfile:
    # Iterate through each line in the input file
    for line in infile:
        try:
            # Parse the JSON data from the line
            data = json.loads(line)
            # Extract the 'point_random' value from the 'dice' section
            point_random = data['dice']['point_random']
            # Write the extracted value to the output file
            outfile.write(f"{point_random}\n")
        except (json.JSONDecodeError, KeyError) as e:
            # Handle any errors (e.g., malformed JSON or missing keys)
            print(f"Error processing line: {line.strip()} - {e}")
print("Extraction complete. Check the output file for results.")
