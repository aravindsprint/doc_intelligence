from setuptools import setup, find_packages

setup(
    name="doc_intelligence",
    version="1.0.0",
    description="Doc Intelligence — AI-powered document analysis for Frappe/ERPNext",
    author="Aravind Govindaraj",
    author_email="aravindsprint@gmail.com",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=[
        "openai>=1.30.0",
        "anthropic>=0.25.0",
        "pypdf>=4.0.0",
        "python-docx>=1.0.0",
    ],
)
