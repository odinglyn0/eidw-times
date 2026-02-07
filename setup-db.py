import os
import sys
import psycopg2

def setup_database():
    if len(sys.argv) < 2:
        print("Usage: python setup-db.py <database_connection_string>")
        sys.exit(1)
    
    connection_string = sys.argv[1]
    
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        schema_path = os.path.join(script_dir, 'sql', 'schema.sql')
        with open(schema_path, 'r') as f:
            schema_sql = f.read()
        
        conn = psycopg2.connect(connection_string)
        cur = conn.cursor()
        
        cur.execute(schema_sql)
        conn.commit()
        
        print("Database schema setup completed successfully!")
        
    except Exception as e:
        print(f"Error setting up database: {e}")
        sys.exit(1)
    finally:
        if 'conn' in locals():
            conn.close()

if __name__ == "__main__":
    setup_database()