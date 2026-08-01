from setuptools import setup, find_packages

with open("requirements.txt") as f:
    install_requires = f.read().strip().split("\n")

setup(
    name="doc_intelligence",
    version="1.0.0",
    description="Doc Intelligence — AI-powered document analysis for Frappe/ERPNext",
    author="Pranera",
    author_email="admin@pranera.in",
    packages=find_packages(),
    zip_safe=False,
    include_package_data=True,
    install_requires=install_requires,
)
