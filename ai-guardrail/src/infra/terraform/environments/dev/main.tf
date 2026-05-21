module "vpc" {
  source = "../../modules/vpc"
  cidr   = "10.0.0.0/16"
  name   = "kyra-dev"
}

module "eks" {
  source             = "../../modules/eks"
  cluster_name       = "kyra-dev"
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnet_ids
  node_instance_type = "m6i.large"
  node_min           = 2
  node_max           = 5
  node_desired       = 2
}

module "rds" {
  source         = "../../modules/rds"
  name           = "kyra-dev"
  vpc_id         = module.vpc.vpc_id
  subnet_ids     = module.vpc.private_subnet_ids
  instance_class = "db.t4g.medium"
  db_name        = "kyra"
  db_username    = "kyra"
  db_password    = var.db_password
}

variable "db_password" { sensitive = true }
