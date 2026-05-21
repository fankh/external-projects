variable "name" {}
variable "vpc_id" {}
variable "subnet_ids" { type = list(string) }
variable "instance_class" { default = "db.r6g.large" }
variable "db_name" {}
variable "db_username" {}
variable "db_password" { sensitive = true }

resource "aws_db_subnet_group" "main" {
  name       = "${var.name}-db-subnet"
  subnet_ids = var.subnet_ids
}

resource "aws_security_group" "rds" {
  name_prefix = "${var.name}-rds-"
  vpc_id      = var.vpc_id
  ingress { from_port = 5432; to_port = 5432; protocol = "tcp"; cidr_blocks = ["10.0.0.0/16"] }
  egress  { from_port = 0; to_port = 0; protocol = "-1"; cidr_blocks = ["0.0.0.0/0"] }
}

resource "aws_db_instance" "main" {
  identifier           = "${var.name}-postgres"
  engine               = "postgres"
  engine_version       = "16.4"
  instance_class       = var.instance_class
  allocated_storage    = 100
  max_allocated_storage = 500
  storage_encrypted    = true
  db_name              = var.db_name
  username             = var.db_username
  password             = var.db_password
  db_subnet_group_name = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]
  multi_az             = true
  backup_retention_period = 7
  deletion_protection  = true
  skip_final_snapshot  = false
  final_snapshot_identifier = "${var.name}-final"
}

output "endpoint" { value = aws_db_instance.main.endpoint }
output "port" { value = aws_db_instance.main.port }
