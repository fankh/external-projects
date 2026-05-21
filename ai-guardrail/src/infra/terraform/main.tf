terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  backend "s3" {
    bucket         = "kyra-terraform-state"
    key            = "kyra/terraform.tfstate"
    region         = "ap-northeast-2"
    dynamodb_table = "kyra-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = { Project = "kyra-guardrail", ManagedBy = "terraform" } }
}
