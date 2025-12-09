import os
import sys
import logging
from src.utils import load_config
from src.collector import DataCollector
from src.analyzer import Analyzer
from src.visualizer import Visualizer
from src.report import ReportGenerator

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def main():
    logger.info("Starting GitHub Yearbook Generator")
    
    # Load Config
    try:
        config = load_config()
    except Exception as e:
        logger.error(f"Failed to load config: {e}")
        return

    # Collect Data
    collector = DataCollector(config)
    logger.info("Collecting data...")
    collector.collect_local()
    # collector.collect_remote() # Commented out for safety/speed in initial test unless token is present
    
    df = collector.deduplicate()
    logger.info(f"Collected {len(df)} unique commits.")
    
    if df.empty:
        logger.warning("No commits found. Check your config and repo paths.")
        return

    # Analyze Data
    analyzer = Analyzer(df)
    stats = analyzer.get_summary_stats()
    logger.info(f"Summary: {stats}")
    
    keywords = analyzer.message_keywords(50)
    logger.info(f"Top Keywords: {keywords[:5]}...")

    # Visualize
    logger.info("Generating visualizations...")
    viz = Visualizer(config['output_dir'])
    viz.plot_timeline(analyzer.timeline_stats())
    viz.plot_projects(analyzer.project_stats())
    viz.plot_languages(analyzer.language_stats())
    viz.plot_wordcloud(keywords)
    viz.generate_social_card(stats)

    # Generate Report
    logger.info("Generating report...")
    reporter = ReportGenerator(config['output_dir'])
    
    # Generate dynamic summary text
    summary_text = f"From {config['start_date']} to {config['end_date']}, I made {stats['total_commits']} commits across {stats['total_repos']} repositories. " \
                   f"{stats['top_repo']} was my main focus. " \
                   f"{stats['peak_month']} was my peak month."

    report_path = reporter.generate_html(stats, summary_text)
    logger.info(f"Report generated at: {report_path}")

if __name__ == "__main__":
    main()
